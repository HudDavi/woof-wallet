const Buffer = require("bitcore-lib").deps.Buffer;
const $ = document.querySelector.bind(document);
const $$ = document.querySelectorAll.bind(document);

const ITEMPERPAGE = 10;

window.onerror = (message) => showErrorPage(message);
window.addEventListener("unhandledrejection", (event) =>
  showErrorPage(event.reason.message)
);

// Show the main and options pages on button click
document.addEventListener("DOMContentLoaded", function () {
  const optionsButton = document.getElementById("options_button");
  const backToWalletButton1 = document.getElementById("back_to_wallet_button1");
  const backToWalletButton2 = document.getElementById("back_to_wallet_button2");
  const backToWalletButton3 = document.getElementById("back_to_wallet_button3");
  const fundingTxButton = document.getElementById("set_funding_tx");

  const optionsIcon = document.getElementById("options_icon");
  optionsButton.addEventListener("click", function () {
    const mainPage = document.getElementById("main_page");
    const optionsPage = document.getElementById("options_page");
    if (mainPage.style.display === "none") {
      mainPage.style.display = "block";
      optionsPage.style.display = "none";
      optionsIcon.src = "images/gear.png";
    } else {
      mainPage.style.display = "none";
      optionsPage.style.display = "block";
      optionsIcon.src = "images/back.png";

      loadWallet().catch((e) => console.error(e));
    }
  });
  backToWalletButton1.addEventListener("click", function () {
    $("#doginal_address_input").disabled = false;
    $("#doginal_send_button").disabled = false;
    showViewWalletPage();
  });
  backToWalletButton2.addEventListener("click", function () {
    $("#doginal_address_input").disabled = false;
    $("#doginal_send_button").disabled = false;
    showViewWalletPage();
  });
  backToWalletButton3.addEventListener("click", function () {
    $("#doginal_address_input").disabled = false;
    $("#doginal_send_button").disabled = false;
    showViewWalletPage();
  });
});

model.load().then(reloadWallet);

function reloadWallet() {
  document.getElementById("main_page").style.display = "flex";
  document.getElementById("options_page").style.display = "none";

  if (!model.hasAllPermissions) {
    showGrantPermissionsPage();
  } else if (!model.acceptedTerms) {
    showAcceptTermsPage();
  } else if (model.credentials) {
    showViewWalletPage();
  } else {
    showSetupPage();
  }
}

function showGrantPermissionsPage() {
  showPage("grant_permissions_page");

  $("#accept_permissions_button").onclick = async () => {
    await model.requestPermissions();
    reloadWallet();
  };
}

function showAcceptTermsPage() {
  showPage("accept_terms_page");

  $("#accept_terms_button").onclick = async () => {
    await model.acceptTerms();
    reloadWallet();
  };
}

function showSetupPage() {
  showPage("setup_page");

  $("#new_wallet_button").onclick = showCreateWalletPage;
  $("#import_wallet_button").onclick = showImportWalletPage;
}

function showCreateWalletPage() {
  showPage("create_page");

  const credentials = model.generateRandomCredentials();

  $("#mnemonic").innerHTML = credentials.mnemonic.toString();

  $("#create_wallet_ok_button").onclick = async () => {
    await model.storeCredentials(credentials);
    showViewWalletPage();
  };
}

function showImportWalletPage() {
  showPage("import_page");

  $("#import_private_key_button").onclick = showImportPrivateKeyPage;
  $("#import_twelve_words_button").onclick = showImportTwelveWordsPage;
}

function showImportPrivateKeyPage() {
  showPage("import_private_key_page");

  $("#private_key_textarea").focus();

  $("#private_key_textarea").oninput = () => {
    const keyText = $("#private_key_textarea").value;
    try {
      if (!keyText) throw new Error();
      new PrivateKey(keyText);
      $("#load_private_key_button").disabled = false;
    } catch (e) {
      $("#load_private_key_button").disabled = true;
    }
  };

  $("#load_private_key_button").onclick = async () => {
    const keyText = $("#private_key_textarea").value;
    const credentials = model.createCredentialsFromPrivateKey(keyText);
    await model.storeCredentials(credentials);
    showViewWalletPage();
  };
}

function showImportTwelveWordsPage() {
  showPage("import_twelve_words_page");

  $("#twelve_words_textarea").focus();
  $("#load_twelve_words_button").disabled = true;

  $("#twelve_words_textarea").oninput = () => {
    const wordsText = $("#twelve_words_textarea").value;
    try {
      if (!wordsText) throw new Error();
      new Mnemonic(wordsText);
      $("#load_twelve_words_button").disabled = false;
    } catch (e) {
      $("#load_twelve_words_button").disabled = true;
    }
  };

  $("#load_twelve_words_button").onclick = async () => {
    const wordsText = $("#twelve_words_textarea").value;
    const credentials = model.createCredentialsFromMnemonic(wordsText);
    await model.storeCredentials(credentials);
    showViewWalletPage();
  };
}

let currentPage = 1;
function showViewWalletPage() {
  showPage("view_wallet_page");

  let balance = 0;
  (async () => {
    balance = await model.getBalance();
    $("#doge_balance").innerHTML = `${balance} DOGE`;
  })();

  const processWalletInformation = async (page) => {
    await model.refreshUtxos(page).then(async () => {
      await model.refreshDoginals().then(() => {
        if (Object.keys(model.inscriptions).length) {
          $("#doginals").innerHTML = "";

          if (model.numUnconfirmed > 0) {
            const pending = document.createElement("div");
            pending.classList.add("pending");
            const suf = model.numUnconfirmed > 1 ? "s" : "";
            pending.innerHTML = `${model.numUnconfirmed} unconfirmed transaction${suf}...`;
            $("#doginals").appendChild(pending);
          }

          let row;
          let i = 0;

          for (const inscription of Object.values(model.inscriptions)) {
            if (!row) {
              row = document.createElement("div");
              row.classList.add("doginals_row");
              spacer = document.createElement("div");
              spacer.classList.add("doginals_row_spacer");
              row.appendChild(spacer);
              $("#doginals").appendChild(row);
            }

            const doginal = document.createElement("div");
            doginal.classList.add("doginal");
            doginal.classList.remove("inscription_text");
            if (inscription.data.toLowerCase().startsWith("data:image/")) {
              doginal.style.backgroundImage = `url(${inscription.data})`;
              if (inscription.data.length < 3000) {
                doginal.style.imageRendering = "pixelated";
              }
            } else if (inscription.data.toLowerCase().startsWith("data:text")) {
              let parts = inscription.data.slice(5).split(";");
              let base64text = parts[parts.length - 1];
              if (base64text.startsWith("base64,"))
                base64text = base64text.slice("base64,".length);
              let text = Buffer.from(base64text, "base64").toString("utf8");
              if (text.startsWith("{") && text.endsWith("}")) {
                let jsonKeyValuePairs = text
                  .replace("{", "")
                  .replace("}", "")
                  .split(",");
                doginal.innerHTML = jsonKeyValuePairs.join("<br /><br />");
              } else {
                doginal.innerHTML = text;
              }
              doginal.classList.add("inscription_text");
            } else {
              doginal.innerHTML = inscription.data.slice(5).split(";")[0];
            }
            doginal.onclick = function () {
              showViewDoginalPage(inscription.id);
            };
            row.appendChild(doginal);

            if (i % 2 == 1) {
              spacer = document.createElement("div");
              spacer.classList.add("doginals_row_spacer");
              row.appendChild(spacer);
              row = null;
            }

            i++;
          }
        } else {
          $("#doginals").innerHTML = "";

          if (model.numUnconfirmed > 0) {
            const pending = document.createElement("div");
            pending.classList.add("pending");
            const suf = model.numUnconfirmed > 1 ? "s" : "";
            pending.innerHTML = `${model.numUnconfirmed} unconfirmed transaction${suf}...`;
            $("#doginals").appendChild(pending);
          } else {
            $("#doginals").innerHTML = "No doginals";
          }
        }
      });
    });
  };

  $("#doginals").innerHTML = "Loading...";
  // start processing wallet information
  (async () => await processWalletInformation(currentPage))();

  const currentPageIndicator = document.getElementById("current-page");
  const nextButton = document.getElementById("next_button");
  if (!nextButton.hasAttribute("data-event-listener-attached")) {
    nextButton.addEventListener("click", async () => {
      currentPage++;
      currentPageIndicator.innerText = currentPage;
      $("#doginals").innerHTML = "Loading...";
      await processWalletInformation(currentPage);
    });
    nextButton.setAttribute("data-event-listener-attached", "true");
  }

  const prevButton = document.getElementById("prev_button");
  if (!prevButton.hasAttribute("data-event-listener-attached")) {
    prevButton.addEventListener("click", async () => {
      if (currentPage > 1) {
        currentPage--;
        currentPageIndicator.innerText = currentPage;
        $("#doginals").innerHTML = "Loading...";
        await processWalletInformation(currentPage);
      }
    });
    prevButton.setAttribute("data-event-listener-attached", "true");
  }

  const currentPageSearchInput = document.getElementById("current-page-search");
  const searchButton = document.getElementById("search_button");
  if (!searchButton.hasAttribute("data-event-listener-attached")) {
    searchButton.addEventListener("click", async () => {
      console.log(currentPageSearchInput.valuew);
      if (currentPageSearchInput.value !== currentPage) {
        currentPage = currentPageSearchInput.value;
        currentPageIndicator.innerText = currentPage;
        $("#doginals").innerHTML = "Loading...";
        await processWalletInformation(currentPage);
      }
    });
    searchButton.setAttribute("data-event-listener-attached", "true");
  }

  const address = model.credentials.privateKey.toAddress().toString();

  $("#copy_address_button").onclick = () =>
    navigator.clipboard.writeText(address);

  $("#address").innerHTML = address;
}

async function showViewDoginalPage(inscriptionId) {
  const key = `inscription_${inscriptionId}`;

  showPage("view_doginal_page");

  if ($("#doginal_address_input").value) {
    $("#doginal_send_button").disabled = false;
  }

  if (model.fundingTx) {
    $("#funding_tx_input").value = model.fundingTx;
  }

  $("#doginal_send_button").onclick = async () => {
    $("#doginal_address_input").disabled = true;
    $("#doginal_send_button").disabled = true;

    const fundingTx = $("#funding_tx_input").value;
    if (fundingTx) {
      model.setFundingTx(fundingTx);
    }

    const address = $("#doginal_address_input").value;
    const inscription = (await browser.storage.local.get(key))[key];

    const txid = await model.sendDoginal(inscription, address);

    showSentPage(txid);
  };

  $("#doginal_address_input").oninput = () => {
    try {
      const address = $("#doginal_address_input").value;
      if (!address.length) throw new Error();
      new Address(address);
      $("#doginal_send_button").disabled = false;
    } catch {
      $("#doginal_send_button").disabled = true;
    }
  };

  const inscription = (await browser.storage.local.get([key]))[key];

  $("#doginal_send_button").disabled = true;
  $("#doginal_inscription_number").innerHTML =
    "Shibescription " + inscription.number;
  $("#doginal_inscription_number").onclick = () =>
    window.open(`${doginalsUri}/shibescription/${inscriptionId}`);

  $("#doginal_content").classList.remove("inscription_text");
  if (inscription.data.toLowerCase().startsWith("data:image/")) {
    $("#doginal_content").style.backgroundImage = `url(${inscription.data})`;
    if (inscription.data.length < 3000) {
      $("#doginal_content").style.imageRendering = "pixelated";
    }
  } else if (inscription.data.toLowerCase().startsWith("data:text")) {
    let parts = inscription.data.slice(5).split(";");
    let base64text = parts[parts.length - 1];
    if (base64text.startsWith("base64,"))
      base64text = base64text.slice("base64,".length);
    let text = Buffer.from(base64text, "base64").toString("utf8");
    if (text.startsWith("{") && text.endsWith("}")) {
      let jsonKeyValuePairs = text.replace("{", "").replace("}", "").split(",");
      $("#doginal_content").innerHTML = jsonKeyValuePairs.join("<br /><br />");
    } else {
      $("#doginal_content").innerHTML = text;
    }
    $("#doginal_content").classList.add("inscription_text");
  } else {
    const contentType = inscription.data.slice(5).split(";")[0];
    $("#doginal_content").innerHTML = contentType;
  }
}

async function showSentPage(txid) {
  showPage("sent_page");
  $("#sent_txid").innerHTML = txid;
  $("#sent_message").innerHTML = "Sent";
}

function showErrorPage(message) {
  showPage("error_page");
  $("#error_message").innerHTML = message;
}

function showPage(page) {
  $$(".page").forEach((element) => (element.style.display = "none"));
  $("#" + page).style.display = "flex";
}

$("#reset_button").disabled = true;
$("#accept_reset_checkbox").onclick = clickAcceptReset;
$("#reset_button").onclick = resetWallet;

async function loadWallet() {
  const values = await browser.storage.local.get([
    "privkey",
    "mnemonic",
    "derivation",
  ]);

  $("#privkey").value = values.privkey || null;
  $("#mnemonic").value = values.mnemonic || null;
  $("#derivation").value = values.derivation || null;

  $("#privkey").disabled = true;
  $("#mnemonic").disabled = true;
  $("#derivation").disabled = true;
}

function clickAcceptReset() {
  if ($("#accept_reset_checkbox").checked) {
    $("#reset_button").disabled = false;
  } else {
    $("#reset_button").disabled = true;
  }
}

async function resetWallet() {
  await browser.storage.local.clear();
  $("#privkey").value = null;
  $("#mnemonic").value = null;
  $("#derivation").value = null;
  $("#accept_reset_checkbox").checked = false;
  $("#reset_button").disabled = true;
  model.reset().then(reloadWallet);
}
