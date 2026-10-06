import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';
import {
  ShoppingBag,
  PlusCircle,
  Edit2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Tag,
  ShieldAlert,
  Upload,
  Trash2,
  Image as ImageIcon
} from 'lucide-react';

const STANDARD_CATEGORIES = ['Milk', 'Curd', 'Ghee', 'Paneer', 'Butter', 'Sweets', 'Beverages'];
const MILK_VARIANTS = ['500 ml', '1 Litre', 'Others'];
const OTHER_VARIANTS = ['200 g', '500 g', '1 kg', 'Pkt', 'Bottle', 'Others'];

export default function ProductsPage({ initialOpenAdd = false }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(initialOpenAdd);
  const [editingProduct, setEditingProduct] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    category: 'Milk',
    variant_label: '500 ml',
    unit_volume_litres: 0.5,
    selling_price: '',
    delivery_charge_type: 'MILK_RULE',
    fixed_delivery_charge: 0,
    image_url: '',
    is_active: 1
  });

  const [categorySelect, setCategorySelect] = useState('Milk');
  const [customCategory, setCustomCategory] = useState('');
  const [variantSelect, setVariantSelect] = useState('500 ml');
  const [customVariant, setCustomVariant] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const imageInputRef = useRef(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get('/products?includeInactive=true');
      setProducts(res);
    } catch (err) {
      setError(err.message || 'Unable to load products.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleOpenAdd = () => {
    setEditingProduct(null);
    setCategorySelect('Milk');
    setCustomCategory('');
    setVariantSelect('500 ml');
    setCustomVariant('');
    setFormData({
      name: '',
      category: 'Milk',
      variant_label: '500 ml',
      unit_volume_litres: 0.5,
      selling_price: '',
      delivery_charge_type: 'MILK_RULE',
      fixed_delivery_charge: 0,
      image_url: '',
      is_active: 1
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (p) => {
    setEditingProduct(p);

    // Determine category selection
    const isStdCategory = STANDARD_CATEGORIES.includes(p.category);
    const catSelect = isStdCategory ? p.category : 'Others';
    setCategorySelect(catSelect);
    setCustomCategory(isStdCategory ? '' : p.category);

    // Determine variant selection
    if (p.category === 'Milk') {
      if (p.variant_label === '500 ml' || p.variant_label === '500ml') {
        setVariantSelect('500 ml');
        setCustomVariant('');
      } else if (p.variant_label === '1 Litre' || p.variant_label === '1L' || p.variant_label === '1 L') {
        setVariantSelect('1 Litre');
        setCustomVariant('');
      } else {
        setVariantSelect('Others');
        setCustomVariant(p.variant_label);
      }
    } else {
      if (['200 g', '500 g', '1 kg', 'Pkt', 'Bottle'].includes(p.variant_label)) {
        setVariantSelect(p.variant_label);
        setCustomVariant('');
      } else {
        setVariantSelect('Others');
        setCustomVariant(p.variant_label);
      }
    }

    setFormData({
      name: p.name,
      category: p.category,
      variant_label: p.variant_label,
      unit_volume_litres: p.unit_volume_litres || 0,
      selling_price: p.selling_price,
      delivery_charge_type: p.delivery_charge_type,
      fixed_delivery_charge: p.fixed_delivery_charge || 0,
      image_url: p.image_url || '',
      is_active: p.is_active
    });
    setFormError('');
    setIsModalOpen(true);
  };

  // Category Change Handler
  const handleCategoryChange = (val) => {
    setCategorySelect(val);
    if (val === 'Milk') {
      setFormData((prev) => ({
        ...prev,
        category: 'Milk',
        variant_label: '500 ml',
        unit_volume_litres: 0.5,
        delivery_charge_type: 'MILK_RULE'
      }));
      setVariantSelect('500 ml');
      setCustomVariant('');
    } else if (val === 'Others') {
      setFormData((prev) => ({
        ...prev,
        category: customCategory || '',
        delivery_charge_type: 'NONE'
      }));
      setVariantSelect('Others');
    } else {
      setFormData((prev) => ({
        ...prev,
        category: val,
        variant_label: 'Pkt',
        unit_volume_litres: 0,
        delivery_charge_type: 'NONE'
      }));
      setVariantSelect('Pkt');
      setCustomVariant('');
    }
  };

  // Variant Selection Handler
  const handleVariantSelectChange = (val) => {
    setVariantSelect(val);
    if (val === '500 ml') {
      setFormData((prev) => ({ ...prev, variant_label: '500 ml', unit_volume_litres: 0.5 }));
      setCustomVariant('');
    } else if (val === '1 Litre') {
      setFormData((prev) => ({ ...prev, variant_label: '1 Litre', unit_volume_litres: 1.0 }));
      setCustomVariant('');
    } else if (val === 'Others') {
      setFormData((prev) => ({ ...prev, variant_label: customVariant }));
    } else {
      setFormData((prev) => ({ ...prev, variant_label: val }));
      setCustomVariant('');
    }
  };

  // Image Upload Handler
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      setFormError('Invalid file type. Please select a PNG, JPG, or JPEG image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFormError('Product image exceeds maximum allowed size of 5MB.');
      return;
    }

    try {
      setUploadingImage(true);
      setFormError('');
      const uploadForm = new FormData();
      uploadForm.append('image', file);

      const res = await api.upload('/products/upload-image', uploadForm);
      if (res?.fileUrl) {
        setFormData((prev) => ({ ...prev, image_url: res.fileUrl }));
      }
    } catch (err) {
      setFormError(err.message || 'Image upload failed. Please try again.');
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    setFormData((prev) => ({ ...prev, image_url: '' }));
  };

  // Save Product Handler
  const handleSaveProduct = async (e) => {
    e.preventDefault();

    const finalCategory = categorySelect === 'Others' ? customCategory.trim() : categorySelect;
    const finalVariant = variantSelect === 'Others' ? customVariant.trim() : variantSelect;

    if (!formData.name.trim()) {
      setFormError('Please enter a product name.');
      return;
    }
    if (!finalCategory) {
      setFormError('Please specify a category.');
      return;
    }
    if (!finalVariant) {
      setFormError('Please specify a variant label (e.g. 500 ml, 1 Litre, 200 g).');
      return;
    }
    if (formData.selling_price === '' || isNaN(parseFloat(formData.selling_price))) {
      setFormError('Please enter a valid selling price.');
      return;
    }

    const payload = {
      ...formData,
      name: formData.name.trim(),
      category: finalCategory,
      variant_label: finalVariant,
      unit_volume_litres: parseFloat(formData.unit_volume_litres) || 0,
      selling_price: parseFloat(formData.selling_price)
    };

    try {
      setSaving(true);
      setFormError('');
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, payload);
      } else {
        await api.post('/products', payload);
      }
      setIsModalOpen(false);
      fetchProducts();
    } catch (err) {
      setFormError(err.message || 'Failed to save product.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (id) => {
    try {
      await api.patch(`/products/${id}/toggle-status`, {});
      fetchProducts();
    } catch (err) {
      alert(err.message || 'Failed to toggle status');
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <ShoppingBag size={28} color="var(--primary)" />
            Product Catalogue & Pricing
          </h1>
          <p className="page-subtitle">Configure Nandini milk variants, curd, ghee, and delivery charge policies</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={fetchProducts} className="btn btn-outline btn-sm">
            <RefreshCw size={16} /> Refresh
          </button>
          <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
            <PlusCircle size={16} /> Add Product
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>Loading products...</div>
      ) : error ? (
        <div className="card" style={{ color: 'var(--accent-red)', padding: '24px', textAlign: 'center' }}>{error}</div>
      ) : products.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No products configured yet"
          description="Click Add Product to setup Milk, Curd, Paneer, or other Nandini items."
          action={
            <button onClick={handleOpenAdd} className="btn btn-primary btn-sm">
              <PlusCircle size={16} /> Add First Product
            </button>
          }
        />
      ) : (
        <div className="table-container">
          <table className="custom-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Variant / Vol</th>
                <th>Selling Price</th>
                <th>Delivery Charge Rule</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {p.image_url ? (
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '6px',
                          background: '#f1f5f9',
                          border: '1px solid #cbd5e1',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <img
                            src={p.image_url}
                            alt={p.name}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        </div>
                      ) : (
                        <div style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '6px',
                          background: '#e8f1fb',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          color: 'var(--primary)'
                        }}>
                          <ShoppingBag size={18} />
                        </div>
                      )}
                      <div>
                        <div style={{ fontWeight: '700', color: 'var(--text-primary)' }}>{p.name}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-indigo">{p.category}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: '600' }}>{p.variant_label}</span>
                    {p.unit_volume_litres > 0 && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                        ({p.unit_volume_litres} L)
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--primary)' }}>
                      ₹{p.selling_price?.toFixed(2)}
                    </span>
                  </td>
                  <td>
                    {p.delivery_charge_type === 'MILK_RULE' ? (
                      <span className="badge badge-info">Milk Volume Rule (₹2 / ₹3 per L)</span>
                    ) : p.delivery_charge_type === 'FIXED_PER_UNIT' ? (
                      <span className="badge badge-warning">Fixed ₹{p.fixed_delivery_charge} / unit</span>
                    ) : (
                      <span className="badge badge-gray">No Delivery Charge</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${p.is_active ? 'badge-success' : 'badge-danger'}`}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="btn btn-outline btn-sm"
                        style={{ padding: '6px 10px' }}
                        title="Edit Product"
                      >
                        <Edit2 size={15} />
                      </button>
                      <button
                        onClick={() => handleToggleStatus(p.id)}
                        className="btn btn-outline btn-sm"
                        style={{ padding: '6px 10px', color: p.is_active ? 'var(--accent-red)' : '#16a34a' }}
                        title={p.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {p.is_active ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? `Edit Product: ${editingProduct.name}` : 'Add New Product'}
        maxWidth="640px"
      >
        <form onSubmit={handleSaveProduct}>
          {formError && (
            <div style={{ background: 'var(--accent-red-light)', color: '#991b1b', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '14px', fontSize: '0.875rem' }}>
              {formError}
            </div>
          )}

          {/* Product Image Upload Box */}
          <div className="form-group" style={{ marginBottom: '16px' }}>
            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ImageIcon size={16} color="var(--primary)" />
              Product Photo
            </label>
            <div style={{
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              background: '#f8fafc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {formData.image_url ? (
                  <div style={{
                    width: '60px',
                    height: '60px',
                    background: 'white',
                    border: '1px solid #cbd5e1',
                    borderRadius: 'var(--radius-sm)',
                    padding: '3px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <img
                      src={formData.image_url}
                      alt="Product Preview"
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                ) : (
                  <div style={{
                    width: '60px',
                    height: '60px',
                    background: '#f1f5f9',
                    border: '1px dashed #cbd5e1',
                    borderRadius: 'var(--radius-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '0.65rem',
                    textAlign: 'center',
                    padding: '4px'
                  }}>
                    <ImageIcon size={18} style={{ opacity: 0.6, marginBottom: '2px' }} />
                    <span>No Photo</span>
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                    {formData.image_url ? 'Product Image Uploaded' : 'Upload product photo'}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Accepts PNG, JPG or JPEG (Max 5MB)
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="file"
                  ref={imageInputRef}
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={handleImageUpload}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="btn btn-outline btn-sm"
                  disabled={uploadingImage}
                >
                  <Upload size={14} />
                  {uploadingImage ? 'Uploading...' : formData.image_url ? 'Change Photo' : 'Upload Photo'}
                </button>
                {formData.image_url && (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="btn btn-outline btn-sm"
                    style={{ color: '#dc2626', borderColor: '#fecaca' }}
                    title="Remove Photo"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Product Name */}
          <div className="form-group">
            <label className="form-label">Product Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Nandini Toned Milk (Blue)"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>

          {/* Category & Variant Row */}
          <div className="form-row">
            {/* Category */}
            <div className="form-group">
              <label className="form-label">Category *</label>
              <select
                className="form-select"
                value={categorySelect}
                onChange={(e) => handleCategoryChange(e.target.value)}
              >
                {STANDARD_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
                <option value="Others">Others (Enter manually)</option>
              </select>

              {/* Custom Category Input if Others is selected */}
              {categorySelect === 'Others' && (
                <div style={{ marginTop: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Enter custom category name (e.g. Ice Cream, Bakery)"
                    value={customCategory}
                    onChange={(e) => {
                      setCustomCategory(e.target.value);
                      setFormData((prev) => ({ ...prev, category: e.target.value }));
                    }}
                    required
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Variant Label */}
            <div className="form-group">
              <label className="form-label">Variant Label *</label>
              <select
                className="form-select"
                value={variantSelect}
                onChange={(e) => handleVariantSelectChange(e.target.value)}
              >
                {categorySelect === 'Milk'
                  ? MILK_VARIANTS.map((v) => (
                      <option key={v} value={v}>{v === 'Others' ? 'Others (Enter custom)' : v}</option>
                    ))
                  : OTHER_VARIANTS.map((v) => (
                      <option key={v} value={v}>{v === 'Others' ? 'Others (Enter custom)' : v}</option>
                    ))}
              </select>

              {/* Custom Variant Input if Others is selected */}
              {variantSelect === 'Others' && (
                <div style={{ marginTop: '8px' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 250 ml / 2 Litre / 100 g / Piece"
                    value={customVariant}
                    onChange={(e) => {
                      setCustomVariant(e.target.value);
                      setFormData((prev) => ({ ...prev, variant_label: e.target.value }));
                    }}
                    required
                    autoFocus
                  />
                </div>
              )}
            </div>
          </div>

          {/* Unit Volume in Litres & Selling Price Row */}
          <div className="form-row">
            {/* Unit Volume in Litres (Step 0.5) */}
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Unit Volume in Litres</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Steps of 0.5 L</span>
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                className="form-input"
                placeholder="0.5, 1.0, 1.5, 2.0"
                value={formData.unit_volume_litres}
                onChange={(e) => setFormData({ ...formData, unit_volume_litres: parseFloat(e.target.value) || 0 })}
              />
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                {[0, 0.5, 1.0, 1.5, 2.0].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setFormData({ ...formData, unit_volume_litres: v })}
                    className={`btn btn-sm ${formData.unit_volume_litres === v ? 'btn-primary' : 'btn-outline'}`}
                    style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                  >
                    {v === 0 ? '0 L' : `${v} L`}
                  </button>
                ))}
              </div>
            </div>

            {/* Selling Price */}
            <div className="form-group">
              <label className="form-label">Selling Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                placeholder="e.g. 27.00"
                value={formData.selling_price}
                onChange={(e) => setFormData({ ...formData, selling_price: e.target.value })}
                required
              />
            </div>
          </div>

          {/* Delivery Charge Rule */}
          <div className="form-group">
            <label className="form-label">Delivery Charge Configuration</label>
            <select
              className="form-select"
              value={formData.delivery_charge_type}
              onChange={(e) => setFormData({ ...formData, delivery_charge_type: e.target.value })}
            >
              <option value="MILK_RULE">Standard Milk Rule (500ml=₹2, 1L+=₹3/L proportional)</option>
              <option value="FIXED_PER_UNIT">Fixed Delivery Charge per Unit</option>
              <option value="NONE">No Delivery Charge (₹0)</option>
            </select>
          </div>

          {formData.delivery_charge_type === 'FIXED_PER_UNIT' && (
            <div className="form-group">
              <label className="form-label">Fixed Delivery Charge (₹ per packet)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="form-input"
                value={formData.fixed_delivery_charge}
                onChange={(e) => setFormData({ ...formData, fixed_delivery_charge: parseFloat(e.target.value) || 0 })}
              />
            </div>
          )}

          {editingProduct && (
            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0', marginBottom: '16px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Note: Updating price now will apply ONLY to future deliveries. Previous recorded deliveries will retain their original prices.
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '20px' }}>
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn btn-outline">
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : editingProduct ? 'Update Product' : 'Save Product'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
