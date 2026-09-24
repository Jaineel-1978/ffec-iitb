(() => {
  const cfg = window.FF_CONFIG || {};

  const configured =
    cfg.supabaseUrl?.startsWith('https://') &&
    cfg.supabaseAnonKey &&
    !cfg.supabaseAnonKey.includes('PASTE_');

  const $ = (q) => document.querySelector(q);

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;',
      '<':'&lt;',
      '>':'&gt;',
      '"':'&quot;',
      "'":'&#39;'
    }[c]));

  const points = (place) =>
    place === 12 ? 12 : place <= 2 ? 0 : place - 2;

  let client;
  let isAdmin = false;
  let activeGroup = 'A';
  let teams = [];
  let results = [];

  // Keeps unsaved organizer entries safe while editing.
  const editorDrafts = {};

  const draftKey = (group, match, teamNumber) =>
    `${group}-${match}-${teamNumber}`;

  const setStatus = (s) => {
    $('#status').textContent = s;
  };

  if (!configured || !window.supabase) {
    setStatus('Setup required');
    $('#progress').textContent =
      'Connect Supabase to publish shared results.';
    return;
  }

  client = window.supabase.createClient(
    cfg.supabaseUrl,
    cfg.supabaseAnonKey
  );

  async function load() {
    setStatus('Updating…');

    const [
      { data: teamData, error: te },
      { data: resultData, error: re }
    ] = await Promise.all([
      client
        .from('teams')
        .select('group_code,team_number,team_name')
        .order('team_number'),

      client
        .from('match_results')
        .select(
          'group_code,match_number,team_number,placement,kills'
        )
    ]);

    if (te || re) {
      setStatus('Could not load');

      $('#progress').textContent =
        te?.message ||
        re?.message ||
        'Database read failed';

      return;
    }

    teams = teamData || [];
    results = resultData || [];

    setStatus('Live');

    render();

    /*
     * IMPORTANT:
     * Do not rebuild the organizer editor automatically while
     * the organizer is typing. The editor has its own draft data.
     */
    if (isAdmin) {
      renderEditor();
    }
  }

  function render() {
    const groupTeams =
      teams.filter(t => t.group_code === activeGroup);

    const rows = groupTeams
      .map(t => {
        const matches = Array.from(
          { length: 5 },
          (_, n) =>
            results.find(
              r =>
                r.group_code === activeGroup &&
                r.match_number === n + 1 &&
                r.team_number === t.team_number
            )
        );

        const scores = matches.map(r =>
          r ? r.kills + points(r.placement) : null
        );

        return {
          team: t,
          scores,
          total: scores
            .filter(v => v !== null)
            .sort((a, b) => b - a)
            .slice(0, 4)
            .reduce((a, b) => a + b, 0)
        };
      })
      .sort(
        (a, b) =>
          b.total - a.total ||
          a.team.team_name.localeCompare(b.team.team_name)
      );

    $('#groupTitle').textContent =
      `Group ${activeGroup} standings`;

    $('#progress').textContent =
      `${new Set(
        results
          .filter(r => r.group_code === activeGroup)
          .map(r => r.match_number)
      ).size} of 5 matches published`;

    $('#board').innerHTML = rows
      .map(
        (r, n) =>
          `<tr>
            <td class="rank">${n + 1}</td>
            <td class="team">${esc(r.team.team_name)}</td>
            ${r.scores
              .map(v => `<td>${v === null ? '—' : v}</td>`)
              .join('')}
            <td class="points">${r.total}</td>
          </tr>`
      )
      .join('');
  }

  /*
   * Save whatever is currently visible in the organizer form
   * into the temporary draft before rebuilding it.
   */
  function captureEditorDraft() {
    if (!isAdmin) return;

    const group = $('#editGroup')?.value;
    const match = Number($('#editMatch')?.value);

    if (!group || !match) return;

    document.querySelectorAll('[data-rank]').forEach(select => {
      const teamNumber = Number(select.dataset.rank);

      const killsInput =
        document.querySelector(
          `[data-kills="${teamNumber}"]`
        );

      editorDrafts[
        draftKey(group, match, teamNumber)
      ] = {
        placement: select.value,
        kills: killsInput?.value ?? '0'
      };
    });

    document.querySelectorAll('.teamname').forEach(input => {
      const teamNumber = Number(input.dataset.name);

      const team = teams.find(
        t =>
          t.group_code === group &&
          t.team_number === teamNumber
      );

      if (team) {
        team.team_name = input.value;
      }
    });
  }

  function renderEditor() {
    const group = $('#editGroup').value;
    const selectedMatch = Number($('#editMatch').value);

    $('#entries').innerHTML = teams
      .filter(t => t.group_code === group)
      .map(t => {
        const databaseResult = results.find(
          x =>
            x.group_code === group &&
            x.match_number === selectedMatch &&
            x.team_number === t.team_number
        );

        const key =
          draftKey(group, selectedMatch, t.team_number);

        const draft = editorDrafts[key];

        const rank =
          draft !== undefined
            ? draft.placement
            : databaseResult?.placement || '';

        const kills =
          draft !== undefined
            ? draft.kills
            : databaseResult?.kills ?? 0;

        return `
          <div class="entry">

            <input
              class="teamname"
              data-name="${t.team_number}"
              value="${esc(t.team_name)}"
              aria-label="Team ${t.team_number} name"
            >

            <select
              data-rank="${t.team_number}"
              aria-label="${esc(t.team_name)} elimination order"
            >
              <option value="">
                Choose elimination rank
              </option>

              ${Array.from({ length: 12 }, (_, i) => {
                const p = i + 1;

                const label =
                  p === 1
                    ? '1 · First eliminated (0 points)'
                    : p === 2
                    ? '2 · Second eliminated (0 points)'
                    : p === 12
                    ? '12 · Booyah (12 points)'
                    : `${p} · Eliminated ${p} (${p - 2} points)`;

                return `
                  <option
                    value="${p}"
                    ${String(rank) === String(p) ? 'selected' : ''}
                  >
                    ${label}
                  </option>
                `;
              }).join('')}
            </select>

            <input
              data-kills="${t.team_number}"
              type="number"
              min="0"
              max="99"
              value="${esc(kills)}"
              aria-label="${esc(t.team_name)} kills"
            >

          </div>
        `;
      })
      .join('');

    /*
     * TEAM NAME
     */
    document.querySelectorAll('.teamname').forEach(input => {
      input.addEventListener('change', async () => {
        const teamNumber = Number(input.dataset.name);
        const newName =
          input.value.trim() ||
          `Team ${String(teamNumber).padStart(2, '0')}`;

        input.value = newName;

        const { error } = await client
          .from('teams')
          .update({
            team_name: newName
          })
          .eq('group_code', group)
          .eq('team_number', teamNumber);

        if (error) {
          $('#saveMsg').textContent =
            `Could not save team name: ${error.message}`;
          return;
        }

        const team = teams.find(
          t =>
            t.group_code === group &&
            t.team_number === teamNumber
        );

        if (team) {
          team.team_name = newName;
        }

        render();

        $('#saveMsg').textContent =
          'Team name saved.';
      });
    });

    /*
     * RANK
     */
    document.querySelectorAll('[data-rank]').forEach(select => {
      select.addEventListener('change', () => {
        const teamNumber =
          Number(select.dataset.rank);

        const killsInput =
          document.querySelector(
            `[data-kills="${teamNumber}"]`
          );

        editorDrafts[
          draftKey(group, selectedMatch, teamNumber)
        ] = {
          placement: select.value,
          kills: killsInput?.value ?? '0'
        };

        $('#saveMsg').textContent =
          'Changes ready to publish.';
      });
    });

    /*
     * KILLS
     */
    document.querySelectorAll('[data-kills]').forEach(input => {
      input.addEventListener('input', () => {
        const teamNumber =
          Number(input.dataset.kills);

        const rankInput =
          document.querySelector(
            `[data-rank="${teamNumber}"]`
          );

        editorDrafts[
          draftKey(group, selectedMatch, teamNumber)
        ] = {
          placement: rankInput?.value ?? '',
          kills: input.value
        };

        $('#saveMsg').textContent =
          'Changes ready to publish.';
      });
    });
  }

  async function authState() {
    const {
      data: { session }
    } = await client.auth.getSession();

    isAdmin = !!session;

    $('#admin').classList.toggle(
      'hidden',
      !isAdmin
    );

    $('#login').classList.add('hidden');

    $('#authToggle').textContent =
      isAdmin
        ? 'Organizer signed in'
        : 'Organizer sign in';

    if (isAdmin) {
      $('#signedIn').textContent =
        `Signed in as ${session.user.email}`;
    }

    render();

    if (isAdmin) {
      renderEditor();
    }
  }

  /*
   * PUBLIC GROUP TABS
   */
  document.querySelectorAll('.tab').forEach(b => {
    b.onclick = () => {
      activeGroup = b.dataset.group;

      document
        .querySelectorAll('.tab')
        .forEach(x =>
          x.classList.toggle(
            'active',
            x === b
          )
        );

      render();
    };
  });

  $('#authToggle').onclick = () =>
    $('#login').classList.toggle('hidden');

  /*
   * LOGIN
   */
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();

    $('#loginMsg').textContent =
      'Signing in…';

    const { error } =
      await client.auth.signInWithPassword({
        email: $('#email').value,
        password: $('#password').value
      });

    $('#loginMsg').textContent =
      error ? error.message : '';

    if (!error) {
      await authState();
    }
  };

  /*
   * LOGOUT
   */
  $('#logout').onclick = async () => {
    await client.auth.signOut();
    await authState();
  };

  /*
   * GROUP / MATCH SELECTION
   */
  $('#editGroup').onchange = () => {
    captureEditorDraft();
    renderEditor();
  };

  $('#editMatch').onchange = () => {
    captureEditorDraft();
    renderEditor();
  };

  /*
   * PUBLISH MATCH
   */
  $('#saveMatch').onclick = async () => {
    if (!isAdmin) return;

    captureEditorDraft();

    const group =
      $('#editGroup').value;

    const match =
      Number($('#editMatch').value);

    const ranks =
      [...document.querySelectorAll('[data-rank]')];

    const places =
      ranks.map(x => Number(x.value));

    /*
     * Require all 12 positions.
     */
    if (
      places.length !== 12 ||
      places.some(
        x => x < 1 || x > 12
      ) ||
      new Set(places).size !== 12
    ) {
      $('#saveMsg').textContent =
        'Choose every rank 1–12 exactly once.';
      return;
    }

    const payload = ranks.map(el => {
      const teamNumber =
        Number(el.dataset.rank);

      const killsInput =
        document.querySelector(
          `[data-kills="${teamNumber}"]`
        );

      return {
        group_code: group,
        match_number: match,
        team_number: teamNumber,
        placement: Number(el.value),
        kills: Math.max(
          0,
          Number(killsInput?.value) || 0
        )
      };
    });

    $('#saveMsg').textContent =
      'Publishing…';

    const { error } =
      await client
        .from('match_results')
        .upsert(payload, {
          onConflict:
            'group_code,match_number,team_number'
        });

    if (error) {
      $('#saveMsg').textContent =
        `Could not publish: ${error.message}`;
      return;
    }

    /*
     * Remove drafts for this published match.
     * The database is now the official version.
     */
    teams
      .filter(t => t.group_code === group)
      .forEach(t => {
        delete editorDrafts[
          draftKey(
            group,
            match,
            t.team_number
          )
        ];
      });

    $('#saveMsg').textContent =
      'Published.';

    await load();
  };

  /*
   * CLEAR MATCH
   */
  $('#clearMatch').onclick = async () => {
    if (!isAdmin) return;

    const group =
      $('#editGroup').value;

    const match =
      Number($('#editMatch').value);

    const confirmed =
      confirm(
        `Clear all results for Group ${group}, Match ${match}?\n\n` +
        `This will remove the placement and kill results for all 12 teams.`
      );

    if (!confirmed) return;

    $('#saveMsg').textContent =
      'Clearing match…';

    const { error } =
      await client
        .from('match_results')
        .delete()
        .eq('group_code', group)
        .eq('match_number', match);

    if (error) {
      $('#saveMsg').textContent =
        `Could not clear match: ${error.message}`;
      return;
    }

    /*
     * Remove any unsaved drafts for this match too.
     */
    teams
      .filter(t => t.group_code === group)
      .forEach(t => {
        delete editorDrafts[
          draftKey(
            group,
            match,
            t.team_number
          )
        ];
      });

    $('#saveMsg').textContent =
      `Group ${group}, Match ${match} cleared.`;

    await load();
  };

  /*
   * Authentication changes.
   */
  client.auth.onAuthStateChange(() =>
    setTimeout(authState, 0)
  );

  load();
  authState();

  /*
   * Refresh the PUBLIC leaderboard periodically.
   *
   * Do NOT rebuild the organizer editor every 30 seconds.
   * The organizer's unsaved form is protected by editorDrafts.
   */
  setInterval(async () => {
    await load();
  }, 30000);

})();
