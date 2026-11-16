/**
 * Safe ONNX Runtime Shim for React Native / Expo Metro Bundler.
 * Prevents Metro transform worker crashes (HTTP 500) from onnxruntime-web's dynamic wasm loader
 * and onnxruntime-node's native C++ bindings in development client environments.
 */

export class Tensor {
  public type: string;
  public data: any;
  public dims: number[];

  constructor(type: string, data: any, dims: number[]) {
    this.type = type;
    this.data = data;
    this.dims = dims;
  }
}

export const InferenceSession = {
  create: async (_modelPathOrBuffer: any, _options?: any) => {
    // Return a lightweight inference session mock or fallback
    return {
      inputNames: ['input', 'data'],
      outputNames: ['output', 'fc1'],
      run: async (_feeds: Record<string, any>) => {
        return {};
      },
    };
  },
};

export default {
  Tensor,
  InferenceSession,
};
