import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import {
  UserCheck,
  Building,
  CreditCard,
  Lock,
  CheckCircle2,
  AlertCircle,
  Save,
  QrCode,
  FileText,
  Upload,
  Trash2,
  PenTool,
  Image as ImageIcon
} from 'lucide-react';

export default function AdminProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState({
    business_name: 'Nandini Milk Parlour',
    business_logo: '',
    phone: '',
    email: '',
    address: '',
    state: 'Karnataka',
    pincode: '',
    business_details: '',
    invoice_business_name: 'Nandini Milk Parlour',
    invoice_logo: '',
    upi_id: '',
    upi_qr: '',
    upi_phone: '7022754524',
    signature: '',
    invoice_footer: 'Thank you for choosing Nandini Milk! Pure & Fresh.'
  });

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const [loading, setLoading] = useState(true);
  const [profileSuccess, setProfileSuccess] = useState('');
  const [profileError, setProfileError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingSignature, setUploadingSignature] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);

  const logoInputRef = useRef(null);
  const sigInputRef = useRef(null);
  const qrInputRef = useRef(null);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get('/profile');
      if (res) {
        setProfile({
          business_name: res.business_name || '',
          business_logo: res.business_logo || '',
          phone: res.phone || '',
          email: res.email || '',
          address: res.address || '',
          state: res.state || 'Karnataka',
          pincode: res.pincode || '',
          business_details: res.business_details || '',
          invoice_business_name: res.invoice_business_name || '',
          invoice_logo: res.invoice_logo || '',
          upi_id: res.upi_id || '',
          upi_qr: res.upi_qr || '',
          upi_phone: res.upi_phone || '7022754524',
          signature: res.signature || '',
          invoice_footer: res.invoice_footer || ''
        });
      }
    } catch (err) {
      setProfileError('Failed to load business profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Frontend validation
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      setProfileError('Invalid file type. Please select a PNG, JPG, or JPEG image for business logo.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileError('Business logo exceeds maximum allowed size of 5MB.');
      return;
    }

    try {
      setUploadingLogo(true);
      setProfileError('');
      setProfileSuccess('');
      const formData = new FormData();
      formData.append('logo', file);

      const res = await api.upload('/profile/upload-logo', formData);
      if (res?.fileUrl) {
        setProfile((prev) => ({
          ...prev,
          business_logo: res.fileUrl,
          invoice_logo: res.fileUrl
        }));
        setProfileSuccess('Business logo uploaded successfully. Remember to click "Save Profile Details" to finalize.');
      }
    } catch (err) {
      setProfileError(err.message || 'Business logo upload failed. Please try again.');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    try {
      const updated = { ...profile, business_logo: '', invoice_logo: '' };
      setProfile(updated);
      await api.put('/profile', updated);
      setProfileSuccess('Business logo removed.');
    } catch (err) {
      setProfileError('Failed to remove business logo.');
    }
  };

  const handleSignatureUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Frontend validation
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      setProfileError('Invalid file type. Please select a PNG, JPG, or JPEG image for signature.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileError('Signature image exceeds maximum allowed size of 5MB.');
      return;
    }

    try {
      setUploadingSignature(true);
      setProfileError('');
      setProfileSuccess('');
      const formData = new FormData();
      formData.append('signature', file);

      const res = await api.upload('/profile/upload-signature', formData);
      if (res?.fileUrl) {
        setProfile((prev) => ({ ...prev, signature: res.fileUrl }));
        setProfileSuccess('Signature uploaded successfully. Remember to click "Save Profile Details" to finalize.');
      }
    } catch (err) {
      setProfileError(err.message || 'Signature upload failed. Please try again.');
    } finally {
      setUploadingSignature(false);
      if (sigInputRef.current) sigInputRef.current.value = '';
    }
  };

  const handleQrUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Frontend validation
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      setProfileError('Invalid file type. Please select a PNG, JPG, or JPEG image for UPI QR code.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setProfileError('QR code image exceeds maximum allowed size of 5MB.');
      return;
    }

    try {
      setUploadingQr(true);
      setProfileError('');
      setProfileSuccess('');
      const formData = new FormData();
      formData.append('upi_qr', file);

      const res = await api.upload('/profile/upload-upi-qr', formData);
      if (res?.fileUrl) {
        setProfile((prev) => ({ ...prev, upi_qr: res.fileUrl }));
        setProfileSuccess('UPI QR code uploaded successfully. Remember to click "Save Profile Details" to finalize.');
      }
    } catch (err) {
      setProfileError(err.message || 'UPI QR upload failed. Please try again.');
    } finally {
      setUploadingQr(false);
      if (qrInputRef.current) qrInputRef.current.value = '';
    }
  };

  const handleRemoveSignature = async () => {
    try {
      const updated = { ...profile, signature: '' };
      setProfile(updated);
      await api.put('/profile', updated);
      setProfileSuccess('Signature removed.');
    } catch (err) {
      setProfileError('Failed to remove signature.');
    }
  };

  const handleRemoveQr = async () => {
    try {
      const updated = { ...profile, upi_qr: '' };
      setProfile(updated);
      await api.put('/profile', updated);
      setProfileSuccess('UPI QR code removed.');
    } catch (err) {
      setProfileError('Failed to remove UPI QR code.');
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    try {
      setSavingProfile(true);
      setProfileError('');
      setProfileSuccess('');
      await api.put('/profile', profile);
      setProfileSuccess('Business & Invoice profile updated successfully.');
    } catch (err) {
      setProfileError(err.message || 'Changes were not saved. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }

    try {
      setSavingPassword(true);
      setPasswordError('');
      setPasswordSuccess('');
      await api.post('/auth/change-password', {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordSuccess('Password changed successfully.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setPasswordError(err.message || 'Failed to update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="page-wrapper">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            <UserCheck size={28} color="var(--primary)" />
            Admin & Business Profile
          </h1>
          <p className="page-subtitle">Manage parlour branding, invoicing template, UPI QR, signature, and login credentials</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
        {/* Business & Invoice Profile */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <Building size={20} color="var(--primary)" />
            <h2 style={{ fontSize: '1.125rem', fontWeight: '800' }}>Business Profile & Invoicing</h2>
          </div>

          {profileSuccess && (
            <div style={{ background: 'var(--secondary-light)', color: '#065f46', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
              <CheckCircle2 size={16} />
              <span>{profileSuccess}</span>
            </div>
          )}

          {profileError && (
            <div style={{ background: 'var(--accent-red-light)', color: '#991b1b', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
              <AlertCircle size={16} />
              <span>{profileError}</span>
            </div>
          )}

          <form onSubmit={handleSaveProfile}>
            {/* Business Logo Upload Section */}
            <div className="form-group" style={{ marginBottom: '20px' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <ImageIcon size={16} color="var(--primary)" />
                Business / Parlour Logo
              </label>
              <div style={{
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '14px',
                background: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  {profile.business_logo ? (
                    <div style={{
                      width: '64px',
                      height: '64px',
                      background: 'white',
                      border: '1px solid #cbd5e1',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <img
                        src={profile.business_logo}
                        alt="Business Logo Preview"
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  ) : (
                    <div style={{
                      width: '64px',
                      height: '64px',
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
                      <ImageIcon size={20} style={{ opacity: 0.6, marginBottom: '2px' }} />
                      <span>No Logo</span>
                    </div>
                  )}
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '0.875rem' }}>
                      {profile.business_logo ? 'Business Logo Configured' : 'No logo uploaded'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Displays on header & invoice bills (PNG, JPG, max 5MB)
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="file"
                    ref={logoInputRef}
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={handleLogoUpload}
                    style={{ display: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="btn btn-outline btn-sm"
                    disabled={uploadingLogo}
                  >
                    <Upload size={14} />
                    {uploadingLogo ? 'Uploading...' : profile.business_logo ? 'Change Logo' : 'Upload Logo'}
                  </button>
                  {profile.business_logo && (
                    <button
                      type="button"
                      onClick={handleRemoveLogo}
                      className="btn btn-outline btn-sm"
                      style={{ color: '#dc2626', borderColor: '#fecaca' }}
                      title="Remove Logo"
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Business / Parlour Name</label>
              <input
                type="text"
                className="form-input"
                value={profile.business_name}
                onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Business Phone</label>
                <input
                  type="tel"
                  className="form-input"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Business Email</label>
                <input
                  type="email"
                  className="form-input"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Parlour Address</label>
              <textarea
                className="form-textarea"
                rows={2}
                value={profile.address}
                onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">State</label>
                <input
                  type="text"
                  className="form-input"
                  value={profile.state}
                  onChange={(e) => setProfile({ ...profile, state: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">PIN Code</label>
                <input
                  type="text"
                  className="form-input"
                  value={profile.pincode}
                  onChange={(e) => setProfile({ ...profile, pincode: e.target.value })}
                />
              </div>
            </div>

            <div style={{ margin: '20px 0', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <CreditCard size={18} color="var(--primary)" />
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700' }}>Invoice & Payment Settings</h3>
              </div>

              <div className="form-group">
                <label className="form-label">Invoice Business Header Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={profile.invoice_business_name}
                  onChange={(e) => setProfile({ ...profile, invoice_business_name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">UPI ID (e.g. nandini@upi / 9876543210@paytm)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="name@okhdfcbank"
                  value={profile.upi_id}
                  onChange={(e) => setProfile({ ...profile, upi_id: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">GPay / PhonePe / Paytm Number (e.g. 7022754524)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="7022754524"
                  value={profile.upi_phone}
                  onChange={(e) => setProfile({ ...profile, upi_phone: e.target.value })}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                  Shown on invoices & included in WhatsApp payment reminder messages.
                </span>
              </div>

              {/* UPI QR Code Uploader */}
              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <QrCode size={16} color="var(--primary)" />
                  UPI QR Code
                </label>
                <div style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {profile.upi_qr ? (
                      <div style={{
                        width: '70px',
                        height: '70px',
                        background: 'white',
                        border: '1px solid #cbd5e1',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <img
                          src={profile.upi_qr}
                          alt="UPI QR Preview"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                    ) : (
                      <div style={{
                        width: '70px',
                        height: '70px',
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
                        <QrCode size={20} style={{ opacity: 0.6, marginBottom: '2px' }} />
                        <span>No QR Code</span>
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.875rem' }}>
                        {profile.upi_qr ? 'UPI QR Code Configured' : 'No UPI QR uploaded'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Accepts PNG, JPG or JPEG (Max 5MB)
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="file"
                      ref={qrInputRef}
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleQrUpload}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => qrInputRef.current?.click()}
                      className="btn btn-outline btn-sm"
                      disabled={uploadingQr}
                    >
                      <Upload size={14} />
                      {uploadingQr ? 'Uploading...' : profile.upi_qr ? 'Change QR' : 'Upload QR'}
                    </button>
                    {profile.upi_qr && (
                      <button
                        type="button"
                        onClick={handleRemoveQr}
                        className="btn btn-outline btn-sm"
                        style={{ color: '#dc2626', borderColor: '#fecaca' }}
                        title="Remove QR Code"
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Authorized Signature Uploader */}
              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <PenTool size={16} color="var(--primary)" />
                  Authorized Signature
                </label>
                <div style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    {profile.signature ? (
                      <div style={{
                        width: '120px',
                        height: '50px',
                        background: 'white',
                        border: '1px solid #cbd5e1',
                        borderRadius: 'var(--radius-sm)',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <img
                          src={profile.signature}
                          alt="Signature Preview"
                          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                    ) : (
                      <div style={{
                        width: '120px',
                        height: '50px',
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
                        <PenTool size={16} style={{ opacity: 0.6, marginBottom: '2px' }} />
                        <span>No signature uploaded</span>
                      </div>
                    )}
                    <div>
                      <div style={{ fontWeight: '700', fontSize: '0.875rem' }}>
                        {profile.signature ? 'Signature Configured' : 'No signature uploaded'}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Appears at invoice bottom (Transparent PNG preferred)
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="file"
                      ref={sigInputRef}
                      accept="image/png,image/jpeg,image/jpg"
                      onChange={handleSignatureUpload}
                      style={{ display: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => sigInputRef.current?.click()}
                      className="btn btn-outline btn-sm"
                      disabled={uploadingSignature}
                    >
                      <Upload size={14} />
                      {uploadingSignature ? 'Uploading...' : profile.signature ? 'Change Signature' : 'Upload Signature'}
                    </button>
                    {profile.signature && (
                      <button
                        type="button"
                        onClick={handleRemoveSignature}
                        className="btn btn-outline btn-sm"
                        style={{ color: '#dc2626', borderColor: '#fecaca' }}
                        title="Remove Signature"
                      >
                        <Trash2 size={14} /> Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-group" style={{ marginTop: '16px' }}>
                <label className="form-label">Invoice Footer Note</label>
                <input
                  type="text"
                  className="form-input"
                  value={profile.invoice_footer}
                  onChange={(e) => setProfile({ ...profile, invoice_footer: e.target.value })}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={savingProfile}>
              <Save size={16} />
              {savingProfile ? 'Saving...' : 'Save Profile Details'}
            </button>
          </form>
        </div>

        {/* Admin Account & Password Change */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Admin Account Info Card */}
          <div className="card">
            <h2 style={{ fontSize: '1.125rem', fontWeight: '800', marginBottom: '16px' }}>
              Administrator Account
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.875rem' }}>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Admin Name: </span>
                <span style={{ fontWeight: '700' }}>{user?.name}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Login Username: </span>
                <span style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--primary)' }}>{user?.username}</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Role: </span>
                <span className="badge badge-info">Administrator / Owner</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-secondary)', fontWeight: '600' }}>Contact Phone: </span>
                <span>{user?.phone || 'Not provided'}</span>
              </div>
            </div>
          </div>

          {/* Change Password Card */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Lock size={18} color="var(--primary)" />
              <h2 style={{ fontSize: '1.125rem', fontWeight: '800' }}>Change Admin Password</h2>
            </div>

            {passwordSuccess && (
              <div style={{ background: 'var(--secondary-light)', color: '#065f46', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
                <CheckCircle2 size={16} />
                <span>{passwordSuccess}</span>
              </div>
            )}

            {passwordError && (
              <div style={{ background: 'var(--accent-red-light)', color: '#991b1b', padding: '10px 14px', borderRadius: 'var(--radius-md)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem' }}>
                <AlertCircle size={16} />
                <span>{passwordError}</span>
              </div>
            )}

            <form onSubmit={handleChangePassword}>
              <div className="form-group">
                <label className="form-label">Current Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">New Password (min 6 characters)</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  className="form-input"
                  placeholder="••••••••"
                  value={passwordForm.confirmPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                  required
                />
              </div>

              <button type="submit" className="btn btn-secondary" style={{ marginTop: '8px' }} disabled={savingPassword}>
                <Lock size={16} />
                {savingPassword ? 'Updating Password...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
