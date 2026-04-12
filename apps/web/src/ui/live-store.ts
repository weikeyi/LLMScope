export const toRealtimeUrl = (apiBaseUrl: string): string => {
  const url = new URL('/ws', apiBaseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
};

export const renderClientScript = (): string => {
  return `(() => {
  const stateNode = document.getElementById('llmscope-observation-state');

  if (!(stateNode instanceof HTMLScriptElement)) {
    return;
  }

  let state = JSON.parse(stateNode.textContent ?? '{}');
  const listRoot = document.querySelector('[data-session-list-root="true"]');
  const detailRoot = document.querySelector('[data-session-detail-root="true"]');
  const errorRoot = document.querySelector('[data-page-error-root="true"]');

  if (!(listRoot instanceof HTMLElement) || !(detailRoot instanceof HTMLElement) || !(errorRoot instanceof HTMLElement)) {
    return;
  }

  const setLoading = (value) => {
    document.body.setAttribute('data-loading', value ? 'true' : 'false');
  };

  const toResponseErrorMessage = async (response, fallback) => {
    const body = await response.json().catch(() => null);

    if (body && typeof body.error === 'string') {
      return typeof body.code === 'string' && body.code.length > 0
        ? '[' + body.code + '] ' + body.error
        : body.error;
    }

    return fallback;
  };

  const refreshFragments = async () => {
    const response = await fetch('/__llmscope/fragment' + window.location.search, {
      headers: {
        accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Live refresh failed.');
    }

    const payload = await response.json();
    listRoot.innerHTML = payload.sessionListHtml;
    detailRoot.innerHTML = payload.sessionDetailHtml;
    errorRoot.innerHTML = payload.errorHtml;
    state = payload.state;
    stateNode.textContent = JSON.stringify(payload.state);
  };

  let refreshScheduled = false;
  let refreshInFlight = false;

  const scheduleRefresh = () => {
    if (refreshScheduled || refreshInFlight) {
      return;
    }

    refreshScheduled = true;

    window.setTimeout(() => {
      refreshScheduled = false;
      refreshInFlight = true;

      void refreshFragments()
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Live refresh failed.';
          window.console.error(message);
        })
        .finally(() => {
          refreshInFlight = false;
        });
    }, 75);
  };

  const toRealtimeUrl = (apiBaseUrl) => {
    const url = new URL('/ws', apiBaseUrl);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.toString();
  };

  let reconnectTimer = null;

  const connect = () => {
    const socket = new WebSocket(toRealtimeUrl(String(state.apiBaseUrl ?? '')));

    socket.addEventListener('message', () => {
      scheduleRefresh();
    });

    socket.addEventListener('close', () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }

      reconnectTimer = window.setTimeout(() => {
        connect();
      }, 1_000);
    });
  };

  const filterForm = document.querySelector('[data-filter-form="true"]');
  filterForm?.addEventListener('submit', () => {
    setLoading(true);
  });

  document.addEventListener('click', (event) => {
    const target = event.target;

    if (!(target instanceof Element)) {
      return;
    }

    if (target.closest('[data-session-link="true"]') !== null) {
      setLoading(true);
      return;
    }

    const actionButton = target.closest('[data-action]');
    if (!(actionButton instanceof HTMLElement)) {
      return;
    }

    const action = actionButton.getAttribute('data-action');
    const apiBaseUrl = String(state.apiBaseUrl ?? '');

    const run = async () => {
      if (action === 'refresh') {
        setLoading(true);
        await refreshFragments();
        setLoading(false);
        return;
      }

      if (action === 'export') {
        setLoading(true);

        try {
          const formatSelect = document.querySelector('[data-export-format="true"]');
          const format =
            formatSelect instanceof HTMLSelectElement ? formatSelect.value : 'markdown';
          const payload =
            typeof state.selectedSessionId === 'string'
              ? { format, sessionIds: [state.selectedSessionId] }
              : { format, query: state.filters ?? {} };
          const response = await fetch(new URL('/api/sessions/export', apiBaseUrl), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          });

          if (!response.ok) {
            throw new Error(
              await toResponseErrorMessage(response, 'Export failed.'),
            );
          }

          const blob = await response.blob();
          const href = URL.createObjectURL(blob);
          const download = document.createElement('a');
          const extension =
            format === 'json' ? 'json' : format === 'ndjson' ? 'ndjson' : 'md';

          download.href = href;
          download.download =
            typeof state.selectedSessionId === 'string'
              ? 'llmscope-session-' + state.selectedSessionId + '.' + extension
              : 'llmscope-sessions.' + extension;
          document.body.append(download);
          download.click();
          download.remove();
          URL.revokeObjectURL(href);
        } finally {
          setLoading(false);
        }

        return;
      }

      if (action === 'delete-session') {
        const confirmMessage = actionButton.getAttribute('data-confirm-message') ?? '';

        if (!window.confirm(confirmMessage)) {
          return;
        }

        setLoading(true);
        const sessionId = actionButton.getAttribute('data-session-id');
        const response = await fetch(
          new URL('/api/sessions/' + encodeURIComponent(sessionId ?? ''), apiBaseUrl),
          { method: 'DELETE' },
        );

        if (!response.ok) {
          setLoading(false);
          throw new Error(
            await toResponseErrorMessage(response, 'Delete failed.'),
          );
        }

        const url = new URL(window.location.href);
        url.searchParams.delete('sessionId');
        window.history.replaceState({}, '', url.pathname + url.search);
        await refreshFragments();
        setLoading(false);
        return;
      }

      if (action === 'clear-all') {
        const confirmMessage = actionButton.getAttribute('data-confirm-message') ?? '';

        if (!window.confirm(confirmMessage)) {
          return;
        }

        setLoading(true);
        const url = new URL('/api/sessions', apiBaseUrl);
        url.searchParams.set('confirm', 'true');
        const response = await fetch(url, { method: 'DELETE' });

        if (!response.ok) {
          setLoading(false);
          throw new Error(
            await toResponseErrorMessage(response, 'Clear failed.'),
          );
        }

        const pageUrl = new URL(window.location.href);
        pageUrl.searchParams.delete('sessionId');
        window.history.replaceState({}, '', pageUrl.pathname + pageUrl.search);
        await refreshFragments();
        setLoading(false);
      }
    };

    void run().catch((error) => {
      setLoading(false);
      const message = error instanceof Error ? error.message : 'Action failed.';
      window.alert(message);
    });
  });

  connect();
})();`;
};
