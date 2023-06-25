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

// eslint-disable-next-line no-unused-vars
async function getCurrentTab() {
  const queryOptions = { active: true, currentWindow: true };
  const [tab] = await chrome.tabs.query(queryOptions);
  return tab;
}

const ReceiveType = {
  SHOW_SCREEN_SHARE: 'SHOW_SCREEN_SHARE',
  REDIRECT_TO_RIGHT_PAGE: 'REDIRECT_TO_RIGHT_PAGE',
  CAMERA_TAB_CHANGED: 'CAMERA_TAB_CHANGED',
};

const SendType = {
  NOT_FOUND: 'NOT_FOUND',
  CAMERA_OPEN: 'CAMERA_OPEN',
  CAMERA_CLOSE: 'CAMERA_CLOSE',
  SHOW_PAGE: 'SHOW_PAGE',
};

async function onShowScreenShare(req, sender, res) {
  const tab = sender.tab;
  await setToLocalStorage({ streamTabId: sender.tab.id });
  tab.url = chrome.runtime.getURL('');
  chrome.desktopCapture.chooseDesktopMedia(['screen', 'window', 'tab'], tab, res);
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tabDetail = await chrome.tabs.get(activeInfo.tabId);
  if (tabDetail.status !== 'complete' || !tabDetail.url.startsWith('http')) {
    return;
  }
  chrome.tabs.sendMessage(activeInfo.tabId, { type: SendType.CAMERA_OPEN });
});

async function onRedirectRightPage(req, sender, res) {
  chrome.tabs.create({ url: 'https://www.google.com' }, (tab) => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (info.status === 'complete' && tabId === tab.id) {
        chrome.tabs.onUpdated.removeListener(listener);
        chrome.tabs.sendMessage(tab.id, { type: SendType.SHOW_PAGE });
      }
    });
  });
  res(true);
}

async function onCameraTabChanged(req, sender, res) {
  const storageData = await getFromLocalStorage(['cameraTabId']);
  await setToLocalStorage({ cameraTabId: sender.tab.id });
  if (!storageData?.cameraTabId || storageData.cameraTabId === sender.tab.id) {
    return;
  }
  chrome.tabs.sendMessage(storageData.cameraTabId, { type: SendType.CAMERA_CLOSE });
  res(true);
}

const reqTypeListners = {
  [ReceiveType.SHOW_SCREEN_SHARE]: onShowScreenShare,
  [ReceiveType.REDIRECT_TO_RIGHT_PAGE]: onRedirectRightPage,
  [ReceiveType.CAMERA_TAB_CHANGED]: onCameraTabChanged,
};

chrome.runtime.onMessage.addListener((req, sender, res) => {
  if (reqTypeListners[req.type]) {
    reqTypeListners[req.type](req, sender, res);
    return true;
  }
  return res({ type: SendType.NOT_FOUND });
});
