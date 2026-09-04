import { Component } from "react";

/**
 * 三个 Edition 共用的错误边界——只负责"捕获渲染期异常 + 提供重试"
 * 这一段逻辑，不带任何视觉样式（Founder/Operator/Cloud 三套 CSS
 * 前缀 fdr-/op-/cc- 完全不同，不适合在这里写死某一套 class）。
 * 视觉交给调用方通过 renderFallback 提供，逻辑只写一次。
 *
 * 单个模块渲染失败时只替换这一块区域的内容，不会让整个应用变成
 * 白屏——之前 ConsoleShell/OperatorPreviewShell/CloudConsoleShell
 * 都没有任何错误边界，一次子组件渲染异常会导致 React 卸载整棵树。
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.retry = this.retry.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error("ErrorBoundary caught a render error:", error, info);
    }
  }

  retry() {
    this.setState({ error: null });
  }

  render() {
    if (this.state.error) {
      return this.props.renderFallback(this.state.error, this.retry);
    }
    return this.props.children;
  }
}
