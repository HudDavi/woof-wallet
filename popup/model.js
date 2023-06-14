const { Address, PrivateKey, Transaction } = require("bitcore-lib");
const Mnemonic = require("bitcore-mnemonic");

const doginalsBaseProtocol = "https";
const doginalsBaseUrl = "wonky-ord.dogeord.io";
const doginalsUri = doginalsBaseProtocol + "://" + doginalsBaseUrl;
const doginalsPermissionsUri = "*://" + doginalsBaseUrl + "/*";

Transaction.DUST_AMOUNT = 1000000;
const FEE_PER_KB = 100000000;

const DERIVATION = "m/44'/3'/0'/0/0";
const NUM_RETRIES = 50;

class Model {
  constructor() {
    this.hasAllPermissions = undefined;
    this.credentials = undefined;
    this.acceptedTerms = undefined;
    this.numUnconfirmed = undefined;
    this.utxos = undefined;
    this.inscriptions = undefined;
    this.fundingTx = undefined;

    this.utxoPage = 1;
    this.utxosPerPage = 10;
    this.utxoPages = [];
  }

  async reset() {
    this.credentials = undefined;
    this.numUnconfirmed = undefined;
    this.utxos = undefined;
    this.inscriptions = undefined;
    this.utxoPage = 1;
    this.utxoPages = [];
    this.fundingTx = undefined;
  }

  async requestPermissions() {
    await browser.permissions.request({
      origins: [
        "*://dogechain.info/*",
        doginalsPermissionsUri,
        "*://api.blockchair.com/*",
      ],
    });

    await this.loadPermissions();

    if (!this.hasAllPermissions) {
      throw new Error("necessary permissions not granted");
    }
  }

  async loadPermissions() {
    const permissions = await browser.permissions.getAll();

    if (!permissions.origins.includes("*://dogechain.info/*")) {
      this.hasAllPermissions = false;
      return;
    }

    if (!permissions.origins.includes(doginalsPermissionsUri)) {
      this.hasAllPermissions = false;
      return;
    }

    if (!permissions.origins.includes("*://api.blockchair.com/*")) {
      this.hasAllPermissions = false;
      return;
    }

    this.hasAllPermissions = true;
  }

  async load() {
    await this.loadPermissions();

    const values = await browser.storage.local.get([
      "privkey",
      "mnemonic",
      "derivation",
      "accepted_terms",
      "utxos",
    ]);

    if (values.privkey) {
      this.credentials = {
        privateKey: new PrivateKey(values.privkey),
        mnemonic: values.mnemonic && new Mnemonic(values.mnemonic),
        derivation: values.derivation,
      };
    }

    this.acceptedTerms = values.accepted_terms;

    this.utxos = values.utxos;
  }

  async acceptTerms() {
    await browser.storage.local.set({ accepted_terms: true });
    this.acceptedTerms = true;
  }

  generateRandomCredentials() {
    const mnemonic = new Mnemonic(Mnemonic.Words.ENGLISH);
    const privateKey = mnemonic
      .toHDPrivateKey()
      .deriveChild(DERIVATION).privateKey;
    return { privateKey, mnemonic, derivation: DERIVATION };
  }

  createCredentialsFromMnemonic(mnemonicText) {
    const mnemonic = new Mnemonic(mnemonicText);
    const privateKey = mnemonic
      .toHDPrivateKey()
      .deriveChild(DERIVATION).privateKey;
    return { privateKey, mnemonic, derivation: DERIVATION };
  }

  createCredentialsFromPrivateKey(privateKeyWIF) {
    const privateKey = new PrivateKey(privateKeyWIF);
    return { privateKey, mnemonic: null, derivation: null };
  }

  async storeCredentials(credentials) {
    await browser.storage.local.set({
      privkey: credentials.privateKey.toWIF(),
      mnemonic: credentials.mnemonic && credentials.mnemonic.toString(),
      derivation: credentials.derivation,
    });

    this.credentials = credentials;
  }

  async setFundingTx(fundingTx) {
    this.fundingTx = fundingTx;
  }

  async getBalance() {
    const address = this.credentials.privateKey.toAddress().toString();
    let balance = 0;
    for (let retry = 0; retry < NUM_RETRIES; retry++) {
      try {
        // query latest utxos
        const resp = await fetch(
          `https://dogechain.info/api/v1/address/balance/${address}`
        );
        const json = await resp.json();
        if (!json.success) throw new Error("dogechain.info error");

        if (json.confirmed) {
          balance = json.confirmed;
        }
        break;
      } catch (e) {
        console.error(e);
        if (retry === NUM_RETRIES - 1) throw e;
      }
    }
    console.log("balance", balance);
    return balance;
  }

  async refreshUtxos(page = 1) {
    let utxos = [];
    let done = false;

    // while (!done) {
    for (let retry = 0; retry < NUM_RETRIES && !done; retry++) {
      try {
        // query latest utxos
        const address = this.credentials.privateKey.toAddress().toString();
        const resp = await fetch(
          `https://dogechain.info/api/v1/address/unspent/${address}/${page}`
        );
        const json = await resp.json();
        if (!json.success) throw new Error("dogechain.info error");

        // convert response to our utxo format
        const partial_utxos = json.unspent_outputs.map((unspent_output) => {
          return {
            txid: unspent_output.tx_hash,
            vout: unspent_output.tx_output_n,
            script: unspent_output.script,
            satoshis: unspent_output.value,
            confirmations: unspent_output.confirmations,
          };
        });

        if (partial_utxos.length === 0) {
          done = true;
        }

        partial_utxos.forEach((utxo) => utxos.push(utxo));
        break;
      } catch (e) {
        console.error(e);
        if (retry === NUM_RETRIES - 1) throw e;
      }
    }
    //}

    if (utxos.length === 0) {
      return null;
    }

    // sort in order of newest to oldest
    utxos.sort((a, b) => (a.confirmations || 0) - (b.confirmations || 0));

    // log the utxos
    console.log("utxos:");
    utxos.forEach((utxo) => {
      console.log(
        utxo.txid +
          ":" +
          utxo.vout +
          ` (sats=${utxo.satoshis} confs=${utxo.confirmations})`
      );
    });

    // filter out unconfirmed because they wont be indexed
    const unconfirmedUtxos = utxos.filter((x) => !x.confirmations);
    const confirmedUtxos = utxos.filter((x) => x.confirmations > 0);

    this.numUnconfirmed = unconfirmedUtxos.length;
    this.utxos = confirmedUtxos;

    // check if these utxos are the same
    if (JSON.stringify(confirmedUtxos) === JSON.stringify(this.utxos)) {
      return;
    }

    let bestHash;
    for (let retry = 0; retry < NUM_RETRIES; retry++) {
      try {
        console.log(`fetching best hash - Round ${retry} of ${NUM_RETRIES}`);
        const bestHashRawResp = await fetch(
          "https://dogechain.info/api/v1/block/besthash"
        );
        const bestHashResp = await bestHashRawResp.json();
        if (!bestHashResp.success) throw new Error("bad request");
        bestHash = bestHashResp.hash;
      } catch (e) {
        console.error(e);
        if (retry === NUM_RETRIES - 1) throw e;
      }
    }

    for (let retry = 0; retry < NUM_RETRIES; retry++) {
      try {
        console.log(
          `checking if utxos are in sync with indexer ${bestHash} - Round ${retry} of ${NUM_RETRIES}`
        );
        const resp3 = await fetch(`${doginalsUri}/block/${bestHash}`);
        if (resp3.status !== 502)
          throw new Error("doginals endpoint is not reachable");

        if (resp3.status !== 200)
          throw new Error("doginals endpoint is out of sync");
      } catch (e) {
        console.error(e);
        // if we got a response that is not 200 and not 502, then we are out of sync
        if (e === "doginals endpoint is out of sync") {
          throw e;
        }

        // otherwise if it is 502, then we try again, but if we are out of retries, then we throw
        if (retry === NUM_RETRIES - 1) throw e;
      }
    }

    // save them for next time
    await browser.storage.local.set({ utxos: confirmedUtxos });

    this.utxoPages[page - 1] = confirmedUtxos; // Save this page of UTXOs

    return this.utxoPages[page - 1];
  }

  async nextUtxos() {
    this.utxoPage += 1;
    return await this.refreshUtxos(this.utxoPage);
  }

  async previousUtxos() {
    if (this.utxoPage > 1) {
      this.utxoPage -= 1;
      this.utxos = this.utxoPages[this.utxoPage - 1];
    }
  }

  async refreshDoginals() {
    const { inscriptionIds, inscriptionOutpoints } =
      await this.refreshInscriptionIds();

    await this.refreshInscriptionContent(inscriptionIds, inscriptionOutpoints);

    console.log("inscriptions:", this.inscriptions);
  }

  async refreshInscriptionIds() {
    // read the inscriptions we have for each output
    const keys = this.utxos.map(
      (utxo) => `inscriptions_at_${utxo.txid}:${utxo.vout}`
    );
    const inscriptionIdsPerOutput = await browser.storage.local.get(keys);
    const allInscriptionIds = [];
    const inscriptionOutpoints = [];

    // if are missing any, download them
    for (const utxo of this.utxos) {
      const key = `inscriptions_at_${utxo.txid}:${utxo.vout}`;

      if (!inscriptionIdsPerOutput[key]) {
        for (let retry = 0; retry < NUM_RETRIES; retry++) {
          try {
            const resp = await fetch(
              `${doginalsUri}/output/${utxo.txid}:${utxo.vout}`
            );
            const html = await resp.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            const main = doc.getElementsByTagName("main")[0];
            const list = main.getElementsByTagName("dl")[0];
            const thumbnails = Array.from(
              list.getElementsByTagName("dd")
            ).filter((x) => x.className === "thumbnails");
            const inscriptionIds = thumbnails.map(
              (x) =>
                x
                  .getElementsByTagName("a")[0]
                  .getAttribute("href")
                  .split("/shibescription/")[1]
            );

            inscriptionIdsPerOutput[key] = inscriptionIds;
            inscriptionIds.forEach((x) => {
              allInscriptionIds.push(x);
              inscriptionOutpoints.push(`${utxo.txid}:${utxo.vout}`);
            });

            if (inscriptionIds.length || utxo.confirmations > 10) {
              await browser.storage.local.set({ [key]: inscriptionIds });
            }
          } catch (e) {
            console.error(e);
            if (retry === NUM_RETRIES - 1) throw e;
          }
        }
      } else {
        inscriptionIdsPerOutput[key].forEach((x) => {
          allInscriptionIds.push(x);
          inscriptionOutpoints.push(`${utxo.txid}:${utxo.vout}`);
        });
      }
    }

    return { inscriptionIds: allInscriptionIds, inscriptionOutpoints };
  }

  async refreshInscriptionContent(inscriptionIds, inscriptionOutpoints) {
    const keys = inscriptionIds.map((x) => `inscription_${x}`);
    const inscriptions = await browser.storage.local.get(keys);

    // download missing content
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];

      if (!inscriptions[key]) {
        const inscriptionId = inscriptionIds[i];
        const url = `${doginalsUri}/content/${inscriptionId}`;
        const resp = await fetch(url);
        const blob = await resp.blob();
        const data = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = function () {
            resolve(this.result);
          };
          reader.readAsDataURL(blob);
        });

        const url2 = `${doginalsUri}/shibescription/${inscriptionId}`;
        const resp2 = await fetch(url2);
        const html = await resp2.text();

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const main = doc.getElementsByTagName("main")[0];
        const h1 = main.getElementsByTagName("h1")[0];
        const number = h1.innerHTML.split(" ")[1];

        const inscription = {
          id: inscriptionId,
          data,
          outpoint: inscriptionOutpoints[i],
          number,
        };
        inscriptions[key] = inscription;
        await browser.storage.local.set({ [key]: inscription });
      }
    }

    this.inscriptions = inscriptions;
  }

  async sendDoginal(inscription, address) {
    let countInOutput = 0;
    for (const entry of Object.values(this.inscriptions)) {
      if (entry.outpoint === inscription.outpoint) {
        countInOutput++;
      }
    }
    if (countInOutput === 0) throw new Error("inscription not found");
    if (countInOutput > 1)
      throw new Error("multi-doginal outputs not supported");

    const inscriptionUtxo = this.utxos.filter(
      (x) => `${x.txid}:${x.vout}` === inscription.outpoint
    )[0];
    if (!inscriptionUtxo) throw new Error("inscription utxo not found");

    const change = model.credentials.privateKey.toAddress().toString();

    let tx;
    let fundingUtxos = [];
    const createTransaction = async () => {
      if (this.fundingTx) {
        const txURL = `api/v1/transaction/${this.fundingTx}`;

        let txContainingFunds;
        for (let retry = 0; retry < NUM_RETRIES; retry++) {
          try {
            console.log(`funding tx - Round ${retry} of ${NUM_RETRIES}`);
            const txRawResp = await fetch(`https://dogechain.info/${txURL}`);
            const txResp = await txRawResp.json();
            if (!txResp.success) throw new Error("bad request");

            txContainingFunds = txResp.transaction;
            console.log("txContainingFunds", txContainingFunds);
            break;
          } catch (e) {
            console.error(e);
            if (retry === NUM_RETRIES - 1)
              throw new Error("fundingTx not found");
          }
        }

        if (txContainingFunds) {
          txContainingFunds.outputs.forEach((output, index) => {
            if (
              output.spent === null &&
              parseFloat(output.value) * 100000000 > Transaction.DUST_AMOUNT &&
              output.address === change &&
              txContainingFunds.confirmations >= 6
            ) {
              const fundingUtxo = {
                txid: txContainingFunds.hash,
                vout: index,
                satoshis: parseFloat(output.value) * 100000000,
                scriptPubKey: output.script.hex,
                confirmations: txContainingFunds.confirmations,
              };
              fundingUtxos.push(fundingUtxo);
            }
          });
        }
      } else {
        // Find all UTXOS with > 10 confirmations and > 100000 satoshis
        fundingUtxos = this.utxos.filter((x) => {
          console.log("utxo", x);
          return x.confirmations >= 6 && x.satoshis > Transaction.DUST_AMOUNT;
        });
      }

      console.log("funding utxos:", fundingUtxos);

      tx = new Transaction();
      tx.feePerKb(FEE_PER_KB);
      tx.from(inscriptionUtxo);
      tx.from(fundingUtxos);
      tx.to(address, Transaction.DUST_AMOUNT);
      tx.change(change);
      tx.sign(model.credentials.privateKey);
      tx.toString();

      try {
        if (tx.inputAmount < tx.outputAmount) {
          const alreadyFetchedPages = this.utxoPages.length;
          if (this.utxoPages.length) {
            this.utxoPage = alreadyFetchedPages;
          }
          const steeringSignal = await this.nextUtxos();
          if (steeringSignal !== null) {
            await createTransaction();
          } else {
            throw new Error(
              "Could not find utxos to fund the transaction. Maybe you need to wait for 6+ confirmations on your previous transaction?"
            );
          }
        }
      } catch (e) {
        throw e;
      }
    };

    try {
      this.utxoPage = 0;
      await createTransaction();
    } catch (e) {
      console.error(e);
      throw new Error(
        "I could not create the transaction. Please ensure you have enough doge to cover the transaction fee and try again."
      );
    }

    const rawTransaction = tx.toString();
    console.log("rawTransaction", rawTransaction);

    const resp = await fetch(
      "https://api.blockchair.com/dogecoin/push/transaction",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          data: tx.toString(),
        }),
      }
    );

    if (resp.status != 200) {
      let json;
      try {
        json = await resp.json();
      } catch {
        throw new Error(resp.status.toString() + ": " + resp.statusText);
      }

      if (json.context && json.context.error) {
        throw new Error(json.context.error);
      } else {
        throw new Error(resp.status.toString() + ": " + resp.statusText);
      }
    }

    return tx.hash;
  }
}

window.model = new Model();
