export const FOUNDER_STATUS = {
  online: { label: "在线", className: "is-online" }, thinking: { label: "思考中", className: "is-thinking" },
  executing: { label: "执行中", className: "is-executing" }, offline: { label: "离线", className: "is-offline" },
  error: { label: "错误", className: "is-error" },
};
export const sinoStatus = (healthy, busy = false) => busy ? FOUNDER_STATUS.thinking : healthy ? FOUNDER_STATUS.online : FOUNDER_STATUS.error;
