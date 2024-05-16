// import * as helios from "@hyperionbt/helios";

import {
    Assets,
    Bip32PrivateKey,
    Crypto,
    NetworkParams,
    SimpleWallet,
    TxId,
    TxInput,
    TxOutput,
    TxOutputId,
    Value,
    type NumberGenerator,
    //@ts-expect-error on internals
    bigIntToBytes, eq, rawNetworkEmulatorParams, type EmulatorTx,
} from "@hyperionbt/helios";
import { dumpAny } from "../diagnostics.js";

const isInternal = Symbol("isInternal");

/**
 * @implements {EmulatorTx}
 */
class GenesisTx {
    #id;
    #address;
    #lovelace;
    #assets;

    /**
     * @param {number} id
     * @param {Address} address
     * @param {bigint} lovelace
     * @param {Assets} assets
     */
    constructor(id, address, lovelace, assets) {
        this.#id = id;
        this.#address = address;
        this.#lovelace = lovelace;
        this.#assets = assets;
    }

    /**
     * Simple incremental txId for genesis transactions.
     * It's very unlikely that regular transactions have the same hash.
     * @return {TxId}
     */
    id() {
        let bytes = bigIntToBytes(BigInt(this.#id));

        if (bytes.length < 32) {
            bytes = new Array(32 - bytes.length).fill(0).concat(bytes);
        }

        return new TxId(bytes);
    }

    /**
     * @param {TxInput} utxo
     * @returns {boolean}
     */
    consumes(utxo) {
        return false;
    }

    /**
     * @param {Address} address
     * @param {TxInput[]} utxos
     * @returns {TxInput[]}
     */
    collectUtxos(address, utxos) {
        if (eq(this.#address.bytes, address.bytes)) {
            utxos = utxos.slice();

            utxos.push(
                new TxInput(
                    new TxOutputId(this.id(), 0),
                    new TxOutput(
                        this.#address,
                        new Value(this.#lovelace, this.#assets)
                    )
                )
            );

            return utxos;
        } else {
            return utxos;
        }
    }

    /**
     * @param {TxOutputId} id
     * @returns {null | TxInput}
     */
    getUtxo(id) {
        if (!(this.id().eq(id.txId) && id.utxoIdx == 0)) {
            return null;
        }

        return new TxInput(
            new TxOutputId(this.id(), 0),
            new TxOutput(this.#address, new Value(this.#lovelace, this.#assets))
        );
    }

    dump() {
        console.log("GENESIS TX");
        console.log(
            `id: ${this.#id.toString()},\naddress: ${this.#address.toBech32()},\nlovelace: ${this.#lovelace.toString()},\nassets: ${JSON.stringify(
                this.#assets.dump(),
                undefined,
                "    "
            )}`
        );
    }
}

/**
 * @implements {EmulatorTx}
 */
class RegularTx {
    #tx;

    /**
     * @param {Tx} tx
     */
    constructor(tx) {
        this.#tx = tx;
    }

    /**
     * @returns {TxId}
     */
    id() {
        return this.#tx.id();
    }

    /**
     * @param {TxInput} utxo
     * @returns {boolean}
     */
    consumes(utxo) {
        const txInputs = this.#tx.body.inputs;

        return txInputs.some((txInput) => txInput.eq(utxo));
    }

    /**
     * @param {Address} address
     * @param {TxInput[]} utxos
     * @returns {TxInput[]}
     */
    collectUtxos(address, utxos) {
        utxos = utxos.filter((utxo) => !this.consumes(utxo));

        const txOutputs = this.#tx.body.outputs;

        txOutputs.forEach((txOutput, utxoId) => {
            if (eq(txOutput.address.bytes, address.bytes)) {
                utxos.push(
                    new TxInput(new TxOutputId(this.id(), utxoId), txOutput)
                );
            }
        });

        return utxos;
    }

    /**
     * @param {TxOutputId} id
     * @returns {null | TxInput}
     */
    getUtxo(id) {
        if (!id.txId.eq(this.id())) {
            return null;
        }

        /**
         * @type {null | TxInput}
         */
        let utxo : null | TxInput = null;

        this.#tx.body.outputs.forEach((output, i) => {
            if (i == id.utxoIdx) {
                utxo = new TxInput(id, output);
            }
        });

        return utxo;
    }

    dump() {
        console.log("REGULAR TX");
        console.log(JSON.stringify(this.#tx.dump(), undefined, "  "));
    }
}

export type NetworkSnapshot = {
    seed: number,
    slot: bigint,
    genesis: GenesisTx[],
    blocks: EmulatorTx[][]
}

let i = 0
/**
 * A simple emulated Network.
 * This can be used to do integration tests of whole dApps.
 * Staking is not yet supported.
 * @implements {Network}
 */
export class StellarNetworkEmulator {
    #slot : bigint
    #seed: number
    #random: NumberGenerator
    #genesis : GenesisTx[]
    #mempool: EmulatorTx[]
    #blocks: EmulatorTx[][]
    i : number
    /**
     * Instantiates a NetworkEmulator at slot 0.
     * An optional seed number can be specified, from which all emulated randomness is derived.
     * @param {number} seed
     */
    constructor(
        seed = 0,
    ) {
        this.i = i++
        this.#seed = seed
        this.#slot = 0n;
        this.#random = this.mulberry32.bind(this);
        this.#genesis = [];
        this.#mempool = [];
        this.#blocks = [];
    }

    // retains continuity for the seed and the RNG through one or more snapshots.
    mulberry32() {
        let t = this.#seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }

    snapshot() : NetworkSnapshot {
        if (this.#mempool.length > 0) {
            throw new Error(`can't snapshot with pending txns`);
        }
        return { 
            seed: this.#seed, 
            slot: this.#slot, 
            genesis: [ ... this.#genesis ],
            blocks: [ ... this.#blocks ]
        }
    }

    loadSnapshot(snapshot : NetworkSnapshot) {
        this.#seed = snapshot.seed;
        this.#slot = snapshot.slot;
        this.#genesis = snapshot.genesis;
        this.#blocks = snapshot.blocks;

        console.log("🌺🌺🌺🌺🌺🌺🌺🌺🌺 ████████  #"+this.i, "  - restored snapshot at slot ", this.#slot.toString(), "height ", this.#blocks.length)
    }

    /**
     * @type {bigint}
     */
    get currentSlot() {
        return this.#slot;
    }

    /**
     * Creates a new `NetworkParams` instance that has access to current slot
     * (so that the `Tx` validity range can be set automatically during `Tx.finalize()`).
     * @param {NetworkParams} networkParams
     * @returns {NetworkParams}
     */
    initNetworkParams(networkParams) {
        const raw = Object.assign({}, networkParams.raw);

        raw.latestTip = {
            epoch: 0,
            hash: "",
            slot: 0,
            time: 0,
        };

        return new NetworkParams(raw, () => {
            return this.#slot;
        });
    }

    /**
     * Creates a new SimpleWallet and populates it with a given lovelace quantity and assets.
     * Special genesis transactions are added to the emulated chain in order to create these assets.
     * @param {bigint} lovelace
     * @param {Assets} assets
     * @returns {SimpleWallet}
     */
    createWallet(lovelace = 0n, assets = new Assets([])) {
        const wallet = new SimpleWallet(
            this,
            Bip32PrivateKey.random(this.#random)
        );

        this.createUtxo(wallet, lovelace, assets);

        return wallet;
    }

    /**
     * Creates a UTxO using a GenesisTx.
     * @param {SimpleWallet} wallet
     * @param {bigint} lovelace
     * @param {Assets} assets
     */
    createUtxo(wallet, lovelace, assets = new Assets([])) {
        if (lovelace != 0n || !assets.isZero()) {
            const tx = new GenesisTx(
                this.#genesis.length,
                wallet.address,
                lovelace,
                assets
            );

            this.#genesis.push(tx);
            this.#mempool.push(tx);
        }
    }

    /**
     * @returns {Promise<NetworkParams>}
     */
    async getParameters() {
        return this.initNetworkParams(
            new NetworkParams(rawNetworkEmulatorParams)
        );
    }

    warnMempool() {
        if (this.#mempool.length > 0) {
            console.error(
                "Warning: mempool not empty (hint: use 'network.tick()')"
            );
        }
    }

    /**
     * Throws an error if the UTxO isn't found
     * @param {TxOutputId} id
     * @returns {Promise<TxInput>}
     */
    async getUtxo(id) {
        this.warnMempool();

        for (let block of this.#blocks) {
            for (let tx of block) {
                const utxo = tx.getUtxo(id);
                if (utxo) {
                    return utxo;
                }
            }
        }

        throw new Error(`utxo with id ${id.toString()} doesn't exist`);
    }

    /**
     * @param {Address} address
     * @returns {Promise<TxInput[]>}
     */
    async getUtxos(address) {
        this.warnMempool();

        let utxos : TxInput[] = [];

        for (let block of this.#blocks) {
            for (let tx of block) {
                utxos = tx.collectUtxos(address, utxos);
            }
        }

        return utxos;
    }

    dump() {
        console.log(`${this.#blocks.length} BLOCKS`);
        this.#blocks.forEach((block, i) => {
            console.log(`${block.length} TXs in BLOCK ${i}`);
            for (let tx of block) {
                tx.dump();
            }
        });
    }

    /**
     * @param {TxInput} utxo
     * @returns {boolean}
     */
    isConsumed(utxo) {
        return (
            this.#blocks.some((b) => {
                return b.some((tx) => {
                    return tx.consumes(utxo);
                });
            }) ||
            this.#mempool.some((tx) => {
                return tx.consumes(utxo);
            })
        );
    }

    /**
     * @param {Tx} tx
     * @returns {Promise<TxId>}
     */
    async submitTx(tx) {
        this.warnMempool();

        assert(
            tx.isValid(this.#slot),
            "tx invalid (not finalized or slot out of range)"
        );

        // make sure that none of the inputs have been consumed before
        for (const input of tx.body.inputs) {
            if (this.isConsumed(input)) {
                throw new Error(`## ${this.i}: input previously consumed:`+ dumpAny(input))
            }
        }

        this.#mempool.push(new RegularTx(tx));
        console.log("##"+this.i+": +mempool txn = ", this.#mempool.length)

        return tx.id();
    }

    /**
     * Mint a block with the current mempool, and advance the slot by a number of slots.
     * @param - nSlots
     */
    tick(nSlots: bigint | number) {
        const n = BigInt(nSlots);
        assert(n> 0, `nSlots must be > 0, got ${n.toString()}`);

        const count = this.#mempool.length;
        const height = this.#blocks.length;
        if (this.#mempool.length > 0) {
            this.#blocks.push(this.#mempool);

            this.#mempool = [];
        }

        this.#slot += n;
        console.log("█  #"+this.i)
        console.log("██")
        console.log("███")
        console.log(`████  @h=${height} + ${count}  txns`)
        console.log(`█████ -> slot ${this.#slot.toString()}`)
    }

}
