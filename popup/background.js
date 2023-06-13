browser.action.onClicked.addListener((tab) => {
  browser.tabs.create({
    url: browser.extension.getURL("popup/popup.html"),
  });
});
