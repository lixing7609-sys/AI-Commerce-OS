function Button({
  children,
  onClick,
  type = "primary",
}) {
  return (
    <button
      className={`os-btn ${type}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export default Button;