export interface TransportOptions {
    groupsEnabled: string[] | boolean;
    groupsDisabled: string[] | boolean;
    storeStackTrace: boolean;
    hideUnformattedParameters: boolean;

    showMeta: boolean;
    batchEnabled: boolean;
}
export const options: TransportOptions;

export namespace util {
    const symbols: {
        readonly success: string;
        readonly error: string;
        readonly warn: string;
        readonly arrow: string;
        readonly star: string;
        readonly box: string;
        readonly boxSuccess: string;
        readonly boxError: string;
        readonly circle: string;
        readonly circleFilled: string;
        readonly asterisk: string;
        readonly floral: string;
        readonly snowflake: string;
        readonly fourDiamond: string;
        readonly spade: string;
        readonly club: string;
        readonly heart: string;
        readonly diamond: string;
        readonly queen: string;
        readonly rook: string;
        readonly pawn: string;
        readonly atom: string;
    }

    function print(message: string, color: string): string;
}

export namespace transports {
    function empty(): void;
    function add(transport: transportClasses.TransportClass): void;
    function get(name: string): transportClasses.TransportClass & TransportOptions[];
}

export namespace transportClasses {
    interface TransportClass {
        property(opts: Partial<TransportOptions>): void;
        log(loggedObject: {}): void;
    }
    class Console { }
    interface Console extends TransportClass {}

    class ConsoleJSON { }
    interface ConsoleJSON extends TransportClass {}

    class History { }
    interface History extends TransportClass {}

    class File { }
    interface File extends TransportClass {}

}

export function log(groupName: string, message: string, extraData?: any): void;
