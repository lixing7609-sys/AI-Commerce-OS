function StatusDot({
  color = "green",
  text,
}) {
  return (
    <span className="status-dot">

      <span
        className={`dot ${color}`}
      />

      {text}

    </span>
  );
}

export default StatusDot;