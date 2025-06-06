import { makeSource } from '@helios-lang/compiler-utils';
import { I as HeliosScriptBundle, K as placeholderSetupDetails } from './HeliosScriptBundle.mjs';
import './DefaultCapo.mjs';
import '@helios-lang/ledger';
import { B as BasicDelegate_hl } from './BasicDelegate.mjs';
import '@helios-lang/uplc';
import '@donecollectively/stellar-contracts/HeliosProgramWithCacheAPI';
import '@helios-lang/compiler';
import '@helios-lang/codec-utils';
import '@helios-lang/crypto';
import '@helios-lang/contract-utils';
import '@helios-lang/tx-utils';
import 'nanoid';

class CapoDelegateBundle extends HeliosScriptBundle {
  scriptParamsSource = "bundle";
  isConcrete = false;
  /**
   * Creates a CapoDelegateBundle subclass based on a specific CapoHeliosBundle class
   */
  static usingCapoBundleClass(c) {
    const cb = new c(placeholderSetupDetails);
    const newClass = class aCapoBoundBundle extends this {
      capoBundle = cb;
      constructor(setupDetails = placeholderSetupDetails) {
        super(setupDetails);
      }
      isConcrete = true;
    };
    return newClass;
  }
  // constructor(public capoBundle: CapoHeliosBundle) {
  //     super();
  // }
  get main() {
    return BasicDelegate_hl;
  }
  get rev() {
    return 1n;
  }
  get params() {
    return {
      rev: this.rev,
      delegateName: this.moduleName,
      isMintDelegate: false,
      isSpendDelegate: false,
      isDgDataPolicy: false,
      requiresGovAuthority: this.requiresGovAuthority
    };
  }
  get moduleName() {
    const specialDgt = this.specializedDelegateModule;
    if (!specialDgt.moduleName) {
      throw new Error(
        "specializedDelegate module must have a moduleName"
      );
    }
    return specialDgt.moduleName;
  }
  getEffectiveModuleList() {
    const specialDgt = this.specializedDelegateModule;
    const delegateWrapper = this.mkDelegateWrapper(specialDgt.moduleName);
    return [
      ...super.getEffectiveModuleList(),
      delegateWrapper,
      this.specializedDelegateModule
    ];
  }
  get modules() {
    return [];
  }
  mkDelegateWrapper(moduleName) {
    const indent = " ".repeat(8);
    const src = `module specializedDelegate
import {
    DelegateActivity,
    DelegateDatum,
    BurningActivity,
    MintingActivity,
    SpendingActivity
} from ${moduleName}
`;
    return makeSource(src, {
      name: `generatedSpecializedDelegateModule`,
      project: "stellar-contracts",
      moreInfo: `${indent}- wraps ${moduleName} provided by ${this.constructor.name}
${indent}  (generated by stellar-contracts:src/delegation/ContractBasedDelegate.ts:mkDelegateWrapper())`
    });
  }
}

export { CapoDelegateBundle };
//# sourceMappingURL=CapoDelegateHeliosBundle.mjs.map
