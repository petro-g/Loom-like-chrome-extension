setTimeout(() => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_PAGE' }, () => {
      if (chrome.runtime.lastError) {
        chrome.runtime.sendMessage({ type: 'REDIRECT_TO_RIGHT_PAGE' });
      } else {
        window.close();
      }
    });
  });
}, 1000);
