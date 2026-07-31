import { useState } from "react";
import { createPortal } from "react-dom";

/**
 * 系统左上角统一品牌标识——所有 Shell（Founder/Operator/Studio/Cloud）
 * 共用同一份实现，不逐页/逐 Shell 硬编码文案。见
 * docs/sinofut-ui-foundation.md「左上角品牌规范」。
 *
 * 展开态：两行文字，SinoFUT 在上（更大更重），AI Commerce OS 在下
 * （更小更弱）。收起态：只保留紧凑字母标识，hover/focus 时用 tooltip
 * 显示完整两行文字——不依赖任何单个 Shell 自己的 Tooltip 组件，因为
 * 这个组件要跨 4 套独立的 React 树复用。
 *
 * 收起态的 tooltip 用 createPortal 挂到 document.body，而不是相对定位
 * 在原地——sidebar 容器普遍设了 overflow:hidden（见
 * console/shell/SidebarFlyout.jsx 同一处踩过的坑），原地绝对定位会被
 * 裁掉。rect 在事件回调里同步用 getBoundingClientRect() 取（不是放进
 * effect 里量），避免 effect 内部调 setState。
 */
export function SinoFUTBrand({ collapsed = false, className = "" }) {
  const [tooltipRect, setTooltipRect] = useState(null);

  if (collapsed) {
    function showTooltip(event) {
      setTooltipRect(event.currentTarget.getBoundingClientRect());
    }
    function hideTooltip() {
      setTooltipRect(null);
    }

    return (
      <span
        className={`sinofut-brand sinofut-brand--collapsed ${className}`.trim()}
        tabIndex={0}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        <span className="sinofut-brand__glyph" aria-hidden="true">S</span>
        <span className="sinofut-brand__sr">SinoFUT · AI Commerce OS</span>
        {tooltipRect
          ? createPortal(
              <span
                className="sinofut-brand__tooltip"
                role="tooltip"
                style={{
                  position: "fixed",
                  left: tooltipRect.right + 10,
                  top: tooltipRect.top + tooltipRect.height / 2,
                  transform: "translateY(-50%)",
                }}
              >
                <span className="sinofut-brand__tooltip-name">SinoFUT</span>
                <span className="sinofut-brand__tooltip-sub">AI Commerce OS</span>
              </span>,
              document.body,
            )
          : null}
      </span>
    );
  }

  return (
    <div className={`sinofut-brand ${className}`.trim()}>
      <div className="sinofut-brand__name">SinoFUT</div>
      <div className="sinofut-brand__sub">AI Commerce OS</div>
    </div>
  );
}
