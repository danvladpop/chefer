/** Hand-written declaration for the plain-JS rule module (see no-forbidden-copy.d.ts). */
export declare const UI_TEXT_ATTRIBUTES: ReadonlySet<string>;

/** True when `text` holds something a translator would have to translate. */
export declare function isTranslatableText(text: unknown): boolean;

/** The ESLint flat-config rule object ({ meta, create }). */
export declare const noHardcodedUiString: unknown;

export default noHardcodedUiString;
