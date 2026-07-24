import { useState } from "react";
import { Modal } from "../../kit/Modal.jsx";
import { Button } from "../../kit/Button.jsx";
import { DEMO_STORES } from "../../mock/storesMock.js";

export function ProductFormModal({ open, onClose, onSave, defaultStoreId, defaultCategory }) {
  const [title, setTitle] = useState("");
  const [sku, setSku] = useState("");
  const [storeId, setStoreId] = useState(defaultStoreId ?? DEMO_STORES[0].id);
  const [category, setCategory] = useState(defaultCategory ?? "");
  const [price, setPrice] = useState(0);

  function handleSave() {
    onSave({
      title,
      sku,
      storeId,
      category,
      price: Number(price),
      cost: 0,
      stock: 0,
      status: "draft",
      lastSyncedAt: null,
      aiContent: null,
    });
    setTitle("");
    setSku("");
    setCategory("");
    setPrice(0);
  }

  return (
    <Modal
      open={open}
      title="新建商品"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={handleSave} disabled={!title || !sku}>创建</Button>
        </>
      }
    >
      <div className="fdr-field">
        <label className="fdr-field__label">所属店铺</label>
        <select className="fdr-select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          {DEMO_STORES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">商品标题</label>
        <input className="fdr-input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">SKU</label>
        <input className="fdr-input" value={sku} onChange={(e) => setSku(e.target.value)} />
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">类目</label>
        <input className="fdr-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="例如：鞋服" />
      </div>
      <div className="fdr-field">
        <label className="fdr-field__label">售价（¥）</label>
        <input className="fdr-input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
      </div>
    </Modal>
  );
}
