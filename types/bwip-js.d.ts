declare module "bwip-js" {
  export interface ToBufferOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    width?: number;
    includetext?: boolean;
    textxalign?: string;
    backgroundcolor?: string;
    paddingwidth?: number;
    paddingheight?: number;
    [key: string]: unknown;
  }

  const bwipjs: {
    toBuffer(
      options: ToBufferOptions
    ): Promise<Buffer>;
  };

  export default bwipjs;
}