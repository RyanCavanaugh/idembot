declare module "sleep-promise" {
    function sleep(milliseconds: number): Promise<void>;
    export = sleep;
}