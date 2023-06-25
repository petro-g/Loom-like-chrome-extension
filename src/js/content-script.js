const mainDiv = document.createElement('div');
mainDiv.id = 'screen-recorder-extension';
document.body.appendChild(mainDiv);
const shadowRoot = mainDiv.attachShadow({ mode: 'open' });
/** @type {HTMLSpanElement} */
let rootSpan;

const SendType = {
  NOT_FOUND: 'REQ_TYPE_HANDLER_NOT_FOUND',
  SHOW_SCREEN_SHARE: 'SHOW_SCREEN_SHARE',
  REDIRECT_TO_RIGHT_PAGE: 'REDIRECT_TO_RIGHT_PAGE',
  CAMERA_TAB_CHANGED: 'CAMERA_TAB_CHANGED',
};

const ReceiveType = {
  SHOW_PAGE: 'SHOW_PAGE',
  CAMERA_CLOSE: 'CAMERA_CLOSE',
  CAMERA_OPEN: 'CAMERA_OPEN',
};

function dragElement(elmnt) {
  let pos1 = 0;
  let pos2 = 0;
  let pos3 = 0;
  let pos4 = 0;
  // otherwise, move the DIV from anywhere inside the DIV:
  elmnt.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    // get the mouse cursor position at startup:
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    // call a function whenever the cursor moves:
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    // calculate the new cursor position:
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;
    // set the element's new position:
    elmnt.style.top = elmnt.offsetTop - pos2 + 'px';
    elmnt.style.left = elmnt.offsetLeft - pos1 + 'px';
  }

  function closeDragElement() {
    // stop moving when mouse button is released:
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

const windowListners = [];

async function resetAllThings() {
  rootSpan?.parentNode.removeChild(rootSpan);
  rootSpan = undefined;
  windowListners.map((listner) => window.removeEventListener(listner.type, listner.func));
  await resetStreamData();
}

/**
 *
 * @param {keyof WindowEventMap} type
 * @param {WindowEventMap[type]} func
 */
function addWindowListner(type, func) {
  window.addEventListener(type, func);
  windowListners.push({ type, func });
}

async function resetStreamData() {
  await setToLocalStorage({
    isStreamStarted: false,
    streamStartedAt: undefined,
    streamTabId: undefined,
    cameraTabId: undefined,
    recordingId: undefined,
  });
}

function setToLocalStorage(data) {
  return new Promise((res) => {
    chrome.storage.local.set(data, res);
  });
}

function getFromLocalStorage(keys) {
  return new Promise((res) => {
    chrome.storage.local.get(keys, res);
  });
}

function sendChromeRuntimeMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, resolve);
  });
}

async function getMedia(constraints) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return stream;
    // eslint-disable-next-line no-empty
  } catch (err) {
    console.log(err, 'Error');
  }
}

function checkAudioPermission() {
  const ele = shadowRoot.getElementById('audio-checker-container');
  if (ele) {
    ele.parentNode.removeChild(ele);
  }
  const iframe = document.createElement('iframe');
  iframe.id = 'audio-checker-container';
  iframe.src = chrome.runtime.getURL('./src/html/audio-checker.html');
  iframe.allow = 'microphone *;';
  iframe.style = 'display: none;';

  return new Promise((resolve, reject) => {
    window.addEventListener('message', function onMessage(event) {
      if (event.target !== window) {
        return;
      }
      if (event.data.type === 'AUDIO_PERMISSION_RESULT') {
        resolve(!!event.data.data.isAudio);
        window.removeEventListener('message', onMessage);
        rootSpan.removeChild(iframe);
        return;
      }
    });
    rootSpan.appendChild(iframe);
  });
}

async function addCameraComponent() {
  await addRootSpanElement();
  const ele = shadowRoot.getElementById('camera-container');
  if (ele) {
    return;
  }
  const cameraWrapper = document.createElement('div');
  cameraWrapper.className = 'camera-wrapper';
  rootSpan.appendChild(cameraWrapper);
  dragElement(cameraWrapper);

  const iframe = document.createElement('iframe');
  iframe.id = 'camera-container';
  iframe.src = chrome.runtime.getURL('./src/html/camera-container.html');
  iframe.allow = 'camera *;';

  return new Promise((resolve, reject) => {
    window.addEventListener('message', function onMessage(event) {
      if (event.target !== window) {
        return;
      }
      if (event.data.type === 'START_CAMERA_RES') {
        resolve(!!event.data.data.isCamera);
        window.removeEventListener('message', onMessage);
        return;
      }
      if (event.data.type === 'ERROR') {
        console.error(event.data);
        window.removeEventListener('message', onMessage);
        rootSpan.removeChild(cameraWrapper);
        resetAllThings();
        return;
      }
    });
    iframe.onload = async () => {
      await sendChromeRuntimeMessage({ type: SendType.CAMERA_TAB_CHANGED });
    };
    cameraWrapper.appendChild(iframe);
  });
}

async function removeCameraComponent() {
  const data = shadowRoot.getElementById('camera-container');
  data?.parentNode.parentNode.removeChild(data.parentNode);
}

async function addAudioVisualContainer() {
  await addRootSpanElement();
  const controlsWrapper = document.createElement('div');
  controlsWrapper.className = 'audio-visual-container-wrapper';
  rootSpan.appendChild(controlsWrapper);

  const iframe = document.createElement('iframe');
  iframe.id = 'audio-visual-container';
  iframe.src = chrome.runtime.getURL('./src/html/audio-visual.html');
  iframe.allow = 'microphone *;clipboard-write *';
  controlsWrapper.appendChild(iframe);
}

async function addRootSpanElement() {
  rootSpan = shadowRoot.getElementById('screen-recorder-wrapper');
  if (!rootSpan) {
    rootSpan = document.createElement('span');
    rootSpan.id = 'screen-recorder-wrapper';
    shadowRoot.appendChild(rootSpan);
    const mainStyleCss = await fetch(chrome.runtime.getURL('./src/css/main-style.css')).then((r) => r.text());

    const mainCssStyle = document.createElement('style');
    mainCssStyle.innerHTML = mainStyleCss;
    rootSpan.appendChild(mainCssStyle);
  }
}

async function startStreaming(s3Credentials) {
  if (!(await checkAudioPermission())) {
    alert('Please allow access to microphone');
    await resetAllThings();
    return;
  }
  if (!(await addCameraComponent())) {
    alert('Please allow access to camera');
    await resetAllThings();
    return;
  }
  const streamId = await sendChromeRuntimeMessage({ type: SendType.SHOW_SCREEN_SHARE });
  if (!streamId) {
    alert('Please share atleast 1 screen to share');
    await resetAllThings();
    return;
  }
  /** @type {HTMLIFrameElement} */
  const streamComponent = shadowRoot.getElementById('audio-visual-container');
  streamComponent.contentWindow.postMessage({ type: 'START_STREAMING', streamId, s3Credentials }, '*');
}

async function onShowPageMessage(req, sender, res) {
  if (window.location.protocol !== 'https:') {
    sendChromeRuntimeMessage({ type: SendType.REDIRECT_TO_RIGHT_PAGE });
  } else {
    const isStreaming = !!shadowRoot.getElementById('screen-recorder-wrapper');
    if (isStreaming) {
      res(true);
      return;
    }
    await addAudioVisualContainer();
    startStreaming().catch((error) => console.error('Error in Starting streaming: ', error));
  }
  res(true);
}

async function onCameraCloseMessage(req, sender, res) {
  await removeCameraComponent();
  res(true);
}

async function onCameraOpenMessage(req, sender, res) {
  const data = await getFromLocalStorage(['isStreamStarted']);
  if (!data?.isStreamStarted) {
    return;
  }
  await addCameraComponent();
  res(true);
}

async function onStartStreamingEvent(eventData) {
  const isStreaming = !!shadowRoot.getElementById('screen-recorder-wrapper');
  if (isStreaming) {
    return;
  }
  await addAudioVisualContainer();
  await startStreaming(eventData.s3Credentials);
}

async function onStopStreamingEvent() {
  const data = await getFromLocalStorage(['isStreamStarted']);
  if (!data?.isStreamStarted) {
    return;
  }
  /** @type {HTMLIFrameElement} */
  const streamComponent = shadowRoot.getElementById('audio-visual-container');
  streamComponent.contentWindow.postMessage({ type: 'STOP_STREAMING' }, '*');
}

async function onCancelStreamingEvent() {
  const data = await getFromLocalStorage(['isStreamStarted']);
  if (!data?.isStreamStarted) {
    return;
  }
  /** @type {HTMLIFrameElement} */
  const streamComponent = shadowRoot.getElementById('audio-visual-container');
  streamComponent.contentWindow.postMessage({ type: 'CANCEL_STREAMING' }, '*');
}

const reqTypeListners = {
  [ReceiveType.SHOW_PAGE]: onShowPageMessage,
  [ReceiveType.CAMERA_CLOSE]: onCameraCloseMessage,
  [ReceiveType.CAMERA_OPEN]: onCameraOpenMessage,
};

chrome.runtime.onMessage.addListener((req, sender, res) => {
  if (reqTypeListners[req.type]) {
    reqTypeListners[req.type](req, sender, res);
    return true;
  }

  return res({ type: SendType.NOT_FOUND });
});

window.addEventListener('message', async (event) => {
  if (event.source !== window) {
    return;
  }
  if (event.data && event.data.type === 'screen-recorder-extension.startStreaming') {
    await onStartStreamingEvent(event.data);
    return;
  }
  if (event.data && event.data.type === 'screen-recorder-extension.stopStreaming') {
    await onStopStreamingEvent();
    return;
  }
  if (event.data && event.data.type === 'screen-recorder-extension.cancelStreaming') {
    await onCancelStreamingEvent();
    return;
  }
});

addWindowListner('message', async (event) => {
  if (event.data.type === 'ERROR') {
    console.error(event.data);
    rootSpan.removeChild(iframe);
    resetAllThings();
    return;
  }
  if (event.data.type === 'STREAM_STARTED') {
    addWindowListner('unload', () => {
      resetStreamData();
    });
    setToLocalStorage({ isStreamStarted: true, streamStartedAt: event.data.startedAt, recordingId: event.data.recordingId });

    window.postMessage({
      type: 'screen-recorder-extension.streamStarted',
      recordingId: event.data.recordingId,
      startedAt: event.data.startedAt,
    });
    return;
  }
  if (event.data.type === 'STREAM_CLOSED') {
    const data = await getFromLocalStorage(['recordingId']);
    if (!data?.recordingId) {
      return;
    }
    await setToLocalStorage({ isStreamStarted: false, streamStartedAt: undefined });
    window.postMessage({
      type: 'screen-recorder-extension.streamStopped',
      recordingId: data.recordingId,
    });
    return;
  }
  if (event.data && event.data.type === 'EXIT_STREAM') {
    const data = await getFromLocalStorage(['recordingId']);
    if (!data?.recordingId) {
      return;
    }
    await resetAllThings();
    window.postMessage({
      type: 'screen-recorder-extension.streamCancelled',
      recordingId: data.recordingId,
    });
    return;
  }
});

(async () => {
  const data = await getFromLocalStorage(['isStreamStarted']);
  if (!data?.isStreamStarted) {
    return;
  }
  await addCameraComponent();
})();
