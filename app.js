(() => {
  const cfg = window.FF_CONFIG || {};
  const configured = cfg.supabaseUrl?.startsWith('https://') && cfg.supabaseAnonKey && !cfg.supabaseAnonKey.includes('PASTE_');
  const $ = (q) => document.querySelector(q);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const points = (place) => place === 12 ? 12 : place <= 2 ? 0 : place - 2;
  let client, isAdmin = false, activeGroup = 'A', teams = [], results = [];
  const setStatus = (s) => { $('#status').textContent = s; };
  if (!configured || !window.supabase) { setStatus('Setup required'); $('#progress').textContent = 'Connect Supabase to publish shared results.'; return; }
  client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

  async function load() {
    setStatus('Updating…');
    const [{data: teamData, error: te}, {data: resultData, error: re}] = await Promise.all([
      client.from('teams').select('group_code,team_number,team_name').order('team_number'),
      client.from('match_results').select('group_code,match_number,team_number,placement,kills')
    ]);
    if (te || re) { setStatus('Could not load'); $('#progress').textContent = te?.message || re?.message || 'Database read failed'; return; }
    teams = teamData || []; results = resultData || []; setStatus('Live'); render(); if (isAdmin) renderEditor();
  }
  function render() {
    const groupTeams = teams.filter(t => t.group_code === activeGroup);
    const rows = groupTeams.map(t => {
      const matches = Array.from({length:5}, (_,n) => results.find(r => r.group_code===activeGroup && r.match_number===n+1 && r.team_number===t.team_number));
      const scores = matches.map(r => r ? r.kills + points(r.placement) : null);
      return {team:t, scores, total:scores.filter(v=>v!==null).sort((a,b)=>b-a).slice(0,4).reduce((a,b)=>a+b,0)};
    }).sort((a,b)=>b.total-a.total || a.team.team_name.localeCompare(b.team.team_name));
    $('#groupTitle').textContent = `Group ${activeGroup} standings`;
    $('#progress').textContent = `${new Set(results.filter(r=>r.group_code===activeGroup).map(r=>r.match_number)).size} of 5 matches published`;
    $('#board').innerHTML = rows.map((r,n)=>`<tr><td class="rank">${n+1}</td><td class="team">${esc(r.team.team_name)}</td>${r.scores.map(v=>`<td>${v===null?'—':v}</td>`).join('')}<td class="points">${r.total}</td></tr>`).join('');
  }
  function renderEditor() {
    const group = $('#editGroup').value, selectedMatch = Number($('#editMatch').value);
    $('#entries').innerHTML = teams.filter(t=>t.group_code===group).map(t=>{
      const r=results.find(x=>x.group_code===group && x.match_number===selectedMatch && x.team_number===t.team_number);
      const rank=r?.placement||'';
      return `<div class="entry"><input class="teamname" data-name="${t.team_number}" value="${esc(t.team_name)}" aria-label="Team ${t.team_number} name"><select data-rank="${t.team_number}" aria-label="${esc(t.team_name)} elimination order"><option value="">Choose elimination rank</option>${Array.from({length:12},(_,i)=>{const p=i+1,label=p===1?'1 · First eliminated (0 points)':p===2?'2 · Second eliminated (0 points)':p===12?'12 · Booyah (12 points)':`${p} · Eliminated ${p} (${p-2} points)`;return `<option value="${p}" ${rank===p?'selected':''}>${label}</option>`}).join('')}</select><input data-kills="${t.team_number}" type="number" min="0" max="99" value="${r?.kills??0}" aria-label="${esc(t.team_name)} kills"></div>`;
    }).join('');
  }
  async function authState() {
    const {data:{session}} = await client.auth.getSession(); isAdmin=!!session;
    $('#admin').classList.toggle('hidden',!isAdmin); $('#login').classList.add('hidden');
    $('#authToggle').textContent=isAdmin?'Organizer signed in':'Organizer sign in';
    if (isAdmin) $('#signedIn').textContent=`Signed in as ${session.user.email}`;
    render(); if(isAdmin) renderEditor();
  }
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{activeGroup=b.dataset.group;document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));render()});
  $('#authToggle').onclick=()=>$('#login').classList.toggle('hidden');
  $('#loginForm').onsubmit=async e=>{e.preventDefault();$('#loginMsg').textContent='Signing in…';const {error}=await client.auth.signInWithPassword({email:$('#email').value,password:$('#password').value});$('#loginMsg').textContent=error?error.message:'';if(!error)await authState()};
  $('#logout').onclick=async()=>{await client.auth.signOut();await authState()};
  $('#editGroup').onchange=renderEditor;$('#editMatch').onchange=renderEditor;
  $('#saveMatch').onclick=async()=>{
    if(!isAdmin)return;
    const group=$('#editGroup').value,match=Number($('#editMatch').value),ranks=[...document.querySelectorAll('[data-rank]')],places=ranks.map(x=>Number(x.value));
    if(places.length!==12||places.some(x=>x<1||x>12)||new Set(places).size!==12){$('#saveMsg').textContent='Choose every rank 1–12 exactly once.';return}
    const payload=ranks.map((el,i)=>({group_code:group,match_number:match,team_number:Number(el.dataset.rank),placement:places[i],kills:Math.max(0,Number(document.querySelector(`[data-kills="${el.dataset.rank}"]`).value)||0)}));
    $('#saveMsg').textContent='Publishing…';
    const teamUpdates=teams.filter(t=>t.group_code===group).map(t=>({group_code:group,team_number:t.team_number,team_name:document.querySelector(`[data-name="${t.team_number}"]`).value.trim()||`Team ${t.team_number}`}));
    const {error:teamError}=await client.from('teams').upsert(teamUpdates,{onConflict:'group_code,team_number'});
    if(teamError){$('#saveMsg').textContent=`Could not save team names: ${teamError.message}`;return}
    const {error}=await client.from('match_results').upsert(payload,{onConflict:'group_code,match_number,team_number'});
    $('#saveMsg').textContent=error?`Could not publish: ${error.message}`:'Published.';if(!error)await load();
  };
  client.auth.onAuthStateChange(()=>setTimeout(authState,0));
  load(); authState();
  // Refresh public scores periodically so open viewer pages catch new match results.
  setInterval(load,30000);
})();
