import { KeyValueList } from "./KeyValueList.jsx";

export function LicenseStatus({ tier, expiresAt }) {
  return (
    <KeyValueList
      items={[
        { label: "套餐", value: tier },
        { label: "到期时间", value: expiresAt },
      ]}
    />
  );
}
