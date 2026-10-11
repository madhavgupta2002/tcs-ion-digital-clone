/*!
 * Exam engine host SDK
 *
 *   <script src="https://digionengine.vercel.app/embed.js"></script>
 *   const result = await TcsExam.start({ config, mode: 'popup' });
 *
 * See README.md ("Embedding in another site") for the full option list.
 */
(function (global) {
  'use strict';

  var NS = 'tcs-exam-engine';
  var MSG_READY = NS + ':ready';
  var MSG_START = NS + ':start';
  var MSG_PROGRESS = NS + ':progress';
  var MSG_RESULT = NS + ':result';

  // Default engine = the origin this script was served from.
  var scriptSrc = document.currentScript && document.currentScript.src;
  var DEFAULT_ENGINE = scriptSrc ? new URL(scriptSrc).origin : 'https://digionengine.vercel.app';

  var active = null;

  function start(options) {
    if (!options || !options.config) return Promise.reject(new Error('TcsExam.start: options.config is required'));
    if (active) return Promise.reject(new Error('TcsExam.start: an exam is already running'));

    var engineUrl = new URL(options.engineUrl || DEFAULT_ENGINE);
    var engineOrigin = engineUrl.origin;
    var mode = options.mode || 'popup';
    var closeOnResult = options.closeOnResult !== false;
    var url = engineUrl.origin + (engineUrl.pathname.replace(/\/$/, '') || '') + '/?embed=1';

    var frame = null; // iframe element
    var popup = null; // Window
    var overlay = null;
    var target = null;
    var lastProgress = null;
    var settled = false;
    var pollId = 0;
    var readyFired = false;

    return new Promise(function (resolve, reject) {
      function cleanup() {
        window.removeEventListener('message', onMessage);
        clearInterval(pollId);
        active = null;
      }
      function closeSurface() {
        if (popup && !popup.closed) popup.close();
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }
      function settle(fn, value) {
        if (settled) return;
        settled = true;
        cleanup();
        if (closeOnResult || fn === reject) closeSurface();
        fn(value);
      }

      function onMessage(e) {
        if (e.origin !== engineOrigin || e.source !== target) return;
        var d = e.data;
        if (!d || typeof d.type !== 'string') return;

        if (d.type === MSG_READY) {
          // Safe to repeat: the engine ignores a second start once running, and a reloaded engine
          // (e.g. after a refresh) gets the exam again and resumes its saved attempt.
          target.postMessage({ type: MSG_START, config: options.config }, engineOrigin);
          if (options.onReady && !readyFired) options.onReady();
          readyFired = true;
        } else if (d.type === MSG_PROGRESS) {
          lastProgress = d.result;
          if (options.onProgress) options.onProgress(d.result);
        } else if (d.type === MSG_RESULT) {
          if (options.onResult) options.onResult(d.result);
          settle(resolve, d.result);
        }
      }
      window.addEventListener('message', onMessage);
      active = {
        cancel: function () {
          settle(reject, new Error('Exam cancelled by host.'));
        },
      };

      if (mode === 'popup') {
        var w = options.width || Math.min(screen.availWidth, 1400);
        var h = options.height || Math.min(screen.availHeight, 900);
        // Must run inside a user gesture (e.g. a click handler) or the browser will block it.
        popup = window.open(
          url,
          'tcs-exam-engine',
          'popup=yes,width=' + w + ',height=' + h + ',left=0,top=0,resizable=yes,scrollbars=yes'
        );
        if (!popup) {
          settle(reject, new Error('The exam window was blocked. Call TcsExam.start from a click handler and allow popups.'));
          return;
        }
        target = popup;
        // Detect the candidate closing the window before submitting.
        pollId = setInterval(function () {
          if (popup.closed && !settled) {
            var err = new Error('Exam window closed before the exam was submitted.');
            err.partial = lastProgress;
            if (options.onAbort) options.onAbort(lastProgress);
            settle(reject, err);
          }
        }, 500);
      } else if (mode === 'iframe') {
        overlay = document.createElement('div');
        overlay.style.cssText = options.container
          ? 'position:relative;width:100%;height:100%'
          : 'position:fixed;inset:0;z-index:2147483000;background:#fff';
        frame = document.createElement('iframe');
        frame.src = url;
        frame.title = 'Online Examination';
        frame.allow = 'fullscreen';
        frame.style.cssText = 'border:0;width:100%;height:100%;display:block';
        overlay.appendChild(frame);
        (options.container || document.body).appendChild(overlay);
        target = frame.contentWindow;
      } else {
        settle(reject, new Error('TcsExam.start: mode must be "popup" or "iframe"'));
      }
    });
  }

  /** Aborts a running exam (closes the window / iframe) without a result. */
  function cancel() {
    if (!active) return;
    active.cancel();
  }

  global.TcsExam = { start: start, cancel: cancel, version: '1.0.0' };
})(window);
