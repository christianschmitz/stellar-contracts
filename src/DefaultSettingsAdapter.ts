import type { AnyDataTemplate } from "./delegation/DelegatedData.js";


export type RealNumberSettingsMap =  { [key: string]: number };
// export type onchainRealNumberSettingsMap = {
//     data: AnyDataTemplate<"set-", Record<string, bigint>> 
// };


// export class SampleSettingsAdapter extends SettingsAdapter<
//     RealNumberSettingsMap,
//     RealNumberSettingsBridge
// > {
//     datumName: string = "SettingsData";
//     fromOnchainDatum(
//         parsedDatum: ParsedSettings<BridgeForSettingsData>,
//     ): RealNumberSettingsMap {
//         console.log("-------------------------------------> ", parsedDatum);
//         const settingsMap: Record<string, number> = {};
//         for (const [ name, microInt ] of Object.entries(parsedDatum.data)) {
//             // get the number found in the microInt
//             if (microInt as bigint > Number.MAX_SAFE_INTEGER) {
//                 throw new Error(
//                     `microInt value too large for Number: ${microInt}`
//                 );
//             }
//             settingsMap[name] = (0.0 + Number(microInt)) / 1_000_000;
//         }
//         return settingsMap;
//     }
//     toOnchainDatum(settings: RealNumberSettingsMap) {

//         const result =  this.inlineDatum("SettingsData", {
//             data: {
//                 "tpe": this.uplcString("set-"),
//                 "@id": this.uplcString("set-42"),
//                 // meaning: this.uplcInt(42),
//                 // happy: this.uplcString("yes")
//                 ...settings
//             }
//         });
//         //!!! check it
//         debugger
//         return result;
//     }
// }
