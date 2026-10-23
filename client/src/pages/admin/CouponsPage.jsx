import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import {
  Ticket,
  Plus,
  Search,
  Calendar,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  BookOpen,
  ArrowDownLeft,
  ArrowUpRight,
  User,
  Phone,
  Building2,
  DollarSign,
  History,
  Sliders,
  X,
  FileSpreadsheet,
  Edit,
  Trash2,
  Milk,
  Check,
  Filter
} from 'lucide-react';

export default function CouponsPage({ onNavigate, initialCustomerId = null }) {
  const [activeTab, setActiveTab] = useState('CUSTOMERS'); // 'CUSTOMERS' or 'BOOKS'
  const [loading, setLoading] = useState(true);
  const [booksLoading, setBooksLoading] = useState(false);

  // Month-end report data
  const [summaryData, setSummaryData] = useState({
    targetMonth: new Date().toISOString().slice(0, 7),
    totalCouponCustomers: 0,
    totalRemainingCoupons: 0,
    totalUsedThisMonth: 0,
    report: []
  });
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // ALL, ACTIVE, LOW, EXHAUSTED

  // All coupon books list (Tab 2)
  const [allBooks, setAllBooks] = useState([]);
  const [bookSearchTerm, setBookSearchTerm] = useState('');
  const [bookStatusFilter, setBookStatusFilter] = useState('ALL');
  const [bookProductFilter, setBookProductFilter] = useState('ALL');

  // Customer dropdown list for issuing books
  const [allCustomers, setAllCustomers] = useState([]);
  const [issueCustomerSearch, setIssueCustomerSearch] = useState('');

  // Available milk products list
  const [allProducts, setAllProducts] = useState([]);

  // Modals
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerHistory, setCustomerHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Form states
  const [issueForm, setIssueForm] = useState({
    customer_id: '',
    product_id: '',
    book_number: '',
    total_coupons: 30,
    price_paid: 750,
    payment_method: 'CASH',
    issue_date: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  const [editBookForm, setEditBookForm] = useState({
    id: null,
    customer_id: null,
    customer_name: '',
    product_id: '',
    book_number: '',
    total_coupons: 30,
    used_coupons: 0,
    remaining_coupons: 30,
    price_paid: 750,
    payment_method: 'CASH',
    issue_date: '',
    status: 'ACTIVE',
    notes: ''
  });

  const [adjustForm, setAdjustForm] = useState({
    customer_id: '',
    change_amount: 1,
    reason: ''
  });

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    fetchSummary();
    fetchCustomers();
    fetchProducts();
    fetchBooks();
  }, [selectedMonth]);

  useEffect(() => {
    if (initialCustomerId && allCustomers.length > 0) {
      const target = allCustomers.find(c => c.id === parseInt(initialCustomerId, 10));
      if (target) {
        handleOpenIssueModal(target);
      }
    }
  }, [initialCustomerId, allCustomers]);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await api.get(`/coupons/summary?month=${selectedMonth}`);
      setSummaryData(res || {});
    } catch (err) {
      console.error('Error fetching coupon summary:', err);
      setMessage({ type: 'error', text: 'Failed to load coupon summary report' });
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await api.get('/customers');
      setAllCustomers(res || []);
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products');
      setAllProducts(res || []);
    } catch (err) {
      console.error('Error fetching products:', err);
    }
  };

  const fetchBooks = async () => {
    try {
      setBooksLoading(true);
      const res = await api.get('/coupons/books');
      setAllBooks(res || []);
    } catch (err) {
      console.error('Error fetching coupon books:', err);
    } finally {
      setBooksLoading(false);
    }
  };

  const fetchCustomerHistory = async (customerId) => {
    try {
      setHistoryLoading(true);
      const res = await api.get(`/coupons/customers/${customerId}`);
      setCustomerHistory(res);
    } catch (err) {
      console.error('Error fetching customer history:', err);
      setMessage({ type: 'error', text: 'Failed to load customer coupon history' });
    } finally {
      setHistoryLoading(false);
    }
  };

  // Calculate delivery charge per packet based on standard milk rules
  const getDeliveryChargePerPacket = (product, customer) => {
    if (customer && customer.customer_category === 'BULK_HOTEL') return 0;
    if (!product) return 2.0; // Standard 500ml milk packet delivery charge

    const chargeType = product.delivery_charge_type;
    if (chargeType === 'NONE') return 0;
    if (chargeType === 'FIXED_PER_UNIT') {
      return parseFloat(product.fixed_delivery_charge || 0);
    }

    // Normal milk delivery rule: <= 500ml is ₹2, > 500ml is volume * ₹3/L (e.g. 1L is ₹3)
    let vol = product.unit_volume_litres;
    if (!vol || vol <= 0) {
      if (product.variant_label && product.variant_label.toLowerCase().includes('500')) vol = 0.5;
      else if (product.variant_label && product.variant_label.toLowerCase().includes('1')) vol = 1.0;
      else vol = 0.5;
    }

    if (vol <= 0.5) {
      return 2.0; // 500ml milk packet = ₹2.00
    }
    return parseFloat((vol * 3.0).toFixed(2)); // >0.5L (e.g. 1L) = ₹3.00
  };

  const getProductUnitPrice = (product) => {
    return product ? parseFloat(product.selling_price || 25) : 25;
  };

  const calculateCouponRate = (product, customer) => {
    const unitPrice = getProductUnitPrice(product);
    const delCharge = getDeliveryChargePerPacket(product, customer);
    const totalRate = parseFloat((unitPrice + delCharge).toFixed(2));
    return { unitPrice, delCharge, totalRate };
  };

  const handleOpenIssueModal = (cust = null, preselectedProductId = null) => {
    const targetCust = cust || allCustomers[0] || null;
    const custId = targetCust ? targetCust.id : '';
    const selectedProd = allProducts.find(p => p.id === parseInt(preselectedProductId, 10));
    const prodPrefix = selectedProd ? (selectedProd.name.toLowerCase().includes('special') ? 'SM' : 'TM') : 'CPN';
    const defaultBookNo = `BK-${prodPrefix}-${custId || '001'}-${new Date().toISOString().slice(5, 7)}${Math.floor(100 + Math.random() * 900)}`;
    const defaultTotal = 30;
    const { totalRate } = calculateCouponRate(selectedProd, targetCust);

    setIssueForm({
      customer_id: custId,
      product_id: preselectedProductId ? String(preselectedProductId) : '',
      book_number: defaultBookNo,
      total_coupons: defaultTotal,
      price_paid: parseFloat((defaultTotal * totalRate).toFixed(2)),
      payment_method: 'CASH',
      issue_date: new Date().toISOString().slice(0, 10),
      notes: targetCust ? `Coupon Book for ${targetCust.name}` : ''
    });
    setSelectedCustomer(targetCust);
    setShowIssueModal(true);
  };

  const handleIssueProductChange = (prodId) => {
    const p = allProducts.find(item => item.id === parseInt(prodId, 10));
    const total = parseInt(issueForm.total_coupons, 10) || 30;
    const targetCust = allCustomers.find(c => c.id === parseInt(issueForm.customer_id, 10)) || selectedCustomer;
    const { totalRate } = calculateCouponRate(p, targetCust);
    const prodPrefix = p ? (p.name.toLowerCase().includes('special') ? 'SM' : 'TM') : 'CPN';
    const newBookNo = issueForm.book_number.startsWith('BK-')
      ? `BK-${prodPrefix}-${issueForm.customer_id || '001'}-${new Date().toISOString().slice(5, 7)}${Math.floor(100 + Math.random() * 900)}`
      : issueForm.book_number;

    setIssueForm({
      ...issueForm,
      product_id: prodId,
      price_paid: parseFloat((total * totalRate).toFixed(2)),
      book_number: newBookNo
    });
  };

  const handleIssueTotalChange = (newTotal) => {
    const total = parseInt(newTotal, 10) || 0;
    const selectedProd = allProducts.find(p => p.id === parseInt(issueForm.product_id, 10));
    const targetCust = allCustomers.find(c => c.id === parseInt(issueForm.customer_id, 10)) || selectedCustomer;
    const { totalRate } = calculateCouponRate(selectedProd, targetCust);
    setIssueForm({
      ...issueForm,
      total_coupons: newTotal,
      price_paid: parseFloat((total * totalRate).toFixed(2))
    });
  };

  const handleOpenEditModal = (book) => {
    setEditBookForm({
      id: book.id,
      customer_id: book.customer_id,
      customer_name: book.customer_name || selectedCustomer?.customerName || selectedCustomer?.name || 'Customer',
      product_id: book.product_id ? String(book.product_id) : '',
      book_number: book.book_number || '',
      total_coupons: book.total_coupons || 0,
      used_coupons: book.used_coupons || 0,
      remaining_coupons: book.remaining_coupons !== undefined ? book.remaining_coupons : 0,
      price_paid: book.price_paid || 0,
      payment_method: book.payment_method || 'CASH',
      issue_date: book.issue_date || new Date().toISOString().slice(0, 10),
      status: book.status || 'ACTIVE',
      notes: book.notes || ''
    });
    setShowEditModal(true);
  };

  const handleOpenAdjustModal = (cust) => {
    setSelectedCustomer(cust);
    setAdjustForm({
      customer_id: cust.id || cust.customerId,
      change_amount: 1,
      reason: ''
    });
    setShowAdjustModal(true);
  };

  const handleOpenHistoryModal = (cust) => {
    const custId = cust.customerId || cust.id;
    setSelectedCustomer(cust);
    setShowHistoryModal(true);
    fetchCustomerHistory(custId);
  };

  const handleIssueSubmit = async (e) => {
    e.preventDefault();
    if (!issueForm.customer_id) {
      setMessage({ type: 'error', text: 'Please select a customer' });
      return;
    }
    if (!issueForm.total_coupons || parseInt(issueForm.total_coupons, 10) <= 0) {
      setMessage({ type: 'error', text: 'Total coupons must be greater than 0' });
      return;
    }

    try {
      setSaving(true);
      const res = await api.post('/coupons/issue', {
        ...issueForm,
        product_id: issueForm.product_id ? parseInt(issueForm.product_id, 10) : null
      });
      setMessage({ type: 'success', text: res.message || 'Coupon book issued successfully!' });
      setShowIssueModal(false);
      fetchSummary();
      fetchCustomers();
      fetchBooks();
    } catch (err) {
      console.error('Issue coupon book error:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to issue coupon book' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editBookForm.id) return;

    try {
      setSaving(true);
      const res = await api.put(`/coupons/books/${editBookForm.id}`, {
        ...editBookForm,
        product_id: editBookForm.product_id ? parseInt(editBookForm.product_id, 10) : null
      });
      setMessage({ type: 'success', text: res.message || 'Coupon book updated successfully!' });
      setShowEditModal(false);
      fetchSummary();
      fetchCustomers();
      fetchBooks();
      if (selectedCustomer) {
        fetchCustomerHistory(selectedCustomer.customerId || selectedCustomer.id);
      }
    } catch (err) {
      console.error('Update book error:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to update coupon book' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBook = async (bookId, bookNumber) => {
    if (!window.confirm(`Are you sure you want to delete / void Coupon Book #${bookNumber}? Unused coupons will be removed from customer balance.`)) {
      return;
    }

    try {
      setSaving(true);
      const res = await api.delete(`/coupons/books/${bookId}`);
      setMessage({ type: 'success', text: res.message || 'Coupon book deleted successfully' });
      fetchSummary();
      fetchCustomers();
      fetchBooks();
      if (selectedCustomer) {
        fetchCustomerHistory(selectedCustomer.customerId || selectedCustomer.id);
      }
    } catch (err) {
      console.error('Delete book error:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to delete coupon book' });
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    if (!adjustForm.customer_id) return;
    const diff = parseInt(adjustForm.change_amount, 10);
    if (isNaN(diff) || diff === 0) {
      setMessage({ type: 'error', text: 'Adjustment amount must be non-zero' });
      return;
    }

    try {
      setSaving(true);
      const res = await api.post('/coupons/adjust', adjustForm);
      setMessage({ type: 'success', text: res.message || 'Balance adjusted successfully!' });
      setShowAdjustModal(false);
      fetchSummary();
      fetchCustomers();
      fetchBooks();
    } catch (err) {
      console.error('Adjust error:', err);
      setMessage({ type: 'error', text: err.message || 'Failed to adjust balance' });
    } finally {
      setSaving(false);
    }
  };

  // Filter report rows (Tab 1)
  const filteredReport = (summaryData.report || []).filter((item) => {
    const matchSearch =
      (item.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.customerPhone || '').includes(searchTerm) ||
      (item.zoneName || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchStatus =
      statusFilter === 'ALL' ||
      (statusFilter === 'ACTIVE' && item.status === 'ACTIVE') ||
      (statusFilter === 'LOW' && item.status === 'LOW') ||
      (statusFilter === 'EXHAUSTED' && item.status === 'EXHAUSTED');

    return matchSearch && matchStatus;
  });

  // Filter books (Tab 2)
  const filteredBooks = allBooks.filter((book) => {
    const q = bookSearchTerm.toLowerCase();
    const matchSearch =
      (book.book_number || '').toLowerCase().includes(q) ||
      (book.customer_name || '').toLowerCase().includes(q) ||
      (book.customer_phone || '').includes(q) ||
      (book.product_name || '').toLowerCase().includes(q);

    const matchStatus = bookStatusFilter === 'ALL' || book.status === bookStatusFilter;

    const matchProduct =
      bookProductFilter === 'ALL' ||
      (bookProductFilter === 'UNIVERSAL' && !book.product_id) ||
      (String(book.product_id) === String(bookProductFilter));

    return matchSearch && matchStatus && matchProduct;
  });

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto', minHeight: '100vh', background: '#f8fafc', backgroundColor: '#f8fafc' }}>
      {/* Alert message */}
      {message.text && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: message.type === 'error' ? '#fef2f2' : '#f0fdf4',
            color: message.type === 'error' ? '#991b1b' : '#166534',
            border: `1px solid ${message.type === 'error' ? '#fecaca' : '#bbf7d0'}`
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {message.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle size={18} />}
            <span style={{ fontSize: '14px', fontWeight: 500 }}>{message.text}</span>
          </div>
          <button
            onClick={() => setMessage({ type: '', text: '' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
            <Ticket size={28} color="#d97706" />
            Coupon Management & Product Book Tracker
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '4px', marginBottom: 0 }}>
            Issue, edit, and track product-specific milk coupon books (Toned Milk, Special Milk, etc.) with automated live deductions.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button
            onClick={() => { fetchSummary(); fetchBooks(); }}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Refresh Report"
          >
            <RefreshCw size={16} className={loading || booksLoading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            onClick={() => handleOpenIssueModal()}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: '#d97706',
              borderColor: '#d97706',
              color: '#fff',
              fontWeight: 600
            }}
          >
            <Plus size={18} />
            Issue New Coupon Book
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        <div style={{ background: '#ffffff', backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Coupon Customers</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
              <User size={20} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {summaryData.totalCouponCustomers}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Operating on prepaid coupon books
          </div>
        </div>

        <div style={{ background: '#ffffff', backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Coupon Books</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#e0e7ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
              <BookOpen size={20} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#4f46e5' }}>
            {allBooks.filter(b => b.status === 'ACTIVE').length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Books in active customer circulation
          </div>
        </div>

        <div style={{ background: '#ffffff', backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Remaining Coupons Left</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a' }}>
              <Ticket size={20} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a' }}>
            {summaryData.totalRemainingCoupons}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Leftover coupons across all milk varieties
          </div>
        </div>

        <div style={{ background: '#ffffff', backgroundColor: '#ffffff', padding: '20px', borderRadius: '12px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Used In {selectedMonth}</span>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626' }}>
              <ArrowDownLeft size={20} />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#dc2626' }}>
            {summaryData.totalUsedThisMonth}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Coupons redeemed for delivered packets
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '2px solid var(--border-color)', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('CUSTOMERS')}
          style={{
            padding: '12px 20px',
            fontSize: '15px',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'CUSTOMERS' ? '3px solid #d97706' : '3px solid transparent',
            color: activeTab === 'CUSTOMERS' ? '#d97706' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '-2px'
          }}
        >
          <User size={18} />
          Customer Balances & Leftovers ({filteredReport.length})
        </button>
        <button
          onClick={() => setActiveTab('BOOKS')}
          style={{
            padding: '12px 20px',
            fontSize: '15px',
            fontWeight: 600,
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'BOOKS' ? '3px solid #d97706' : '3px solid transparent',
            color: activeTab === 'BOOKS' ? '#d97706' : 'var(--text-secondary)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '-2px'
          }}
        >
          <BookOpen size={18} />
          All Coupon Books (Add / Edit / Modify) ({allBooks.length})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: Customer Balances & Month-End Leftovers */}
      {/* ========================================================================= */}
      {activeTab === 'CUSTOMERS' && (
        <>
          {/* Filter and Month Toolbar */}
          <div
            style={{
              background: '#ffffff',
              backgroundColor: '#ffffff',
              padding: '16px 20px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              marginBottom: '20px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
              {/* Month Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={18} color="var(--text-muted)" />
                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="form-control"
                  style={{ width: '160px', padding: '8px 12px', fontSize: '14px', borderRadius: '8px' }}
                />
              </div>

              {/* Search Bar */}
              <div style={{ position: 'relative', minWidth: '240px', flex: 1, maxWidth: '380px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search customer name, phone, zone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '36px', paddingRight: '12px', width: '100%', borderRadius: '8px' }}
                />
              </div>

              {/* Status Filter */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {['ALL', 'ACTIVE', 'LOW', 'EXHAUSTED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: statusFilter === st ? 'none' : '1px solid var(--border-color)',
                      background:
                        statusFilter === st
                          ? (st === 'ACTIVE' ? '#16a34a' : st === 'LOW' ? '#d97706' : st === 'EXHAUSTED' ? '#dc2626' : 'var(--primary)')
                          : 'transparent',
                      color: statusFilter === st ? '#fff' : 'var(--text-secondary)'
                    }}
                  >
                    {st === 'ALL' ? 'All Customers' : st === 'LOW' ? 'Low (≤5)' : st}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Showing <strong>{filteredReport.length}</strong> customer{filteredReport.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Customer Coupon Report Table */}
          <div style={{ background: '#ffffff', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 16px' }}>Customer</th>
                    <th style={{ padding: '12px 16px' }}>Zone</th>
                    <th style={{ padding: '12px 16px' }}>Milk Product Coupons Breakdown</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Books</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Used ({selectedMonth})</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Total Leftover</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="8" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                        Loading coupon tracker...
                      </td>
                    </tr>
                  ) : filteredReport.length === 0 ? (
                    <tr>
                      <td colSpan="8" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <Ticket size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                        <p style={{ margin: 0, fontWeight: 500 }}>No coupon customers match the current filter</p>
                        <button
                          onClick={() => handleOpenIssueModal()}
                          className="btn btn-primary"
                          style={{ marginTop: '12px', background: '#d97706', borderColor: '#d97706', fontSize: '13px' }}
                        >
                          <Plus size={14} style={{ marginRight: '4px' }} />
                          Issue First Coupon Book
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredReport.map((row) => (
                      <tr
                        key={row.customerId}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          transition: 'background 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.customerName}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <Phone size={12} />
                            {row.customerPhone}
                            {row.flatNo && <span>• Flat {row.flatNo}</span>}
                          </div>
                        </td>

                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)' }}>
                            <Building2 size={13} color="var(--text-muted)" />
                            <span>{row.zoneName}</span>
                          </div>
                          {row.routeName && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {row.routeName}
                            </div>
                          )}
                        </td>

                        {/* Product Coupons Breakdown */}
                        <td style={{ padding: '14px 16px' }}>
                          {row.productBreakdown && row.productBreakdown.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {row.productBreakdown.map((pb, idx) => (
                                <span
                                  key={idx}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '3px 8px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 600,
                                    background: pb.productId ? '#eff6ff' : '#f8fafc',
                                    color: pb.productId ? '#1e40af' : '#475569',
                                    border: `1px solid ${pb.productId ? '#bfdbfe' : '#e2e8f0'}`
                                  }}
                                  title={`${pb.remaining} coupons remaining for ${pb.productName}`}
                                >
                                  <span>🥛 {pb.productName}</span>
                                  <span style={{
                                    background: pb.productId ? '#2563eb' : '#64748b',
                                    color: '#fff',
                                    padding: '1px 6px',
                                    borderRadius: '10px',
                                    fontSize: '11px',
                                    fontWeight: 700
                                  }}>
                                    {pb.remaining}
                                  </span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                              {row.remainingCoupons > 0 ? `${row.remainingCoupons} General coupons` : 'No active books'}
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 600 }}>
                          <span style={{ padding: '2px 8px', borderRadius: '10px', background: '#f1f5f9', fontSize: '13px' }}>
                            {row.totalBooks} book{row.totalBooks !== 1 ? 's' : ''}
                          </span>
                        </td>

                        <td style={{ padding: '14px 16px', textAlign: 'center', color: '#4f46e5', fontWeight: 600 }}>
                          {row.usedThisMonth}
                        </td>

                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          <div
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '4px 12px',
                              borderRadius: '16px',
                              fontWeight: 700,
                              fontSize: '15px',
                              background:
                                row.remainingCoupons === 0
                                  ? '#fee2e2'
                                  : row.remainingCoupons <= 5
                                  ? '#fef3c7'
                                  : '#dcfce7',
                              color:
                                row.remainingCoupons === 0
                                  ? '#991b1b'
                                  : row.remainingCoupons <= 5
                                  ? '#92400e'
                                  : '#166534'
                            }}
                          >
                            <Ticket size={14} />
                            <span>{row.remainingCoupons}</span>
                          </div>
                        </td>

                        <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                          {row.remainingCoupons === 0 ? (
                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#fee2e2', color: '#991b1b' }}>
                              Exhausted
                            </span>
                          ) : row.remainingCoupons <= 5 ? (
                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>
                              Low Balance
                            </span>
                          ) : (
                            <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, background: '#dcfce7', color: '#166534' }}>
                              Active
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button
                              onClick={() => handleOpenIssueModal({ id: row.customerId, name: row.customerName })}
                              className="btn btn-outline"
                              style={{
                                padding: '4px 10px',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                borderColor: '#d97706',
                                color: '#d97706',
                                background: '#fffbeb'
                              }}
                              title="Add / Top-up Coupon Book"
                            >
                              <Plus size={13} />
                              Add Book
                            </button>

                            <button
                              onClick={() => handleOpenHistoryModal(row)}
                              className="btn btn-outline"
                              style={{
                                padding: '4px 10px',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                              title="View Usage History"
                            >
                              <History size={13} />
                              History
                            </button>

                            <button
                              onClick={() => handleOpenAdjustModal(row)}
                              className="btn btn-outline"
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                color: 'var(--text-muted)'
                              }}
                              title="Manual Adjustment"
                            >
                              <Sliders size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: All Coupon Books Management (Add / Edit / Modify) */}
      {/* ========================================================================= */}
      {activeTab === 'BOOKS' && (
        <>
          {/* Books Toolbar */}
          <div
            style={{
              background: '#ffffff',
              backgroundColor: '#ffffff',
              padding: '16px 20px',
              borderRadius: '12px',
              border: '1px solid var(--border-color)',
              marginBottom: '20px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '16px',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
              {/* Search Bar */}
              <div style={{ position: 'relative', minWidth: '240px', flex: 1, maxWidth: '340px' }}>
                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Search book #, customer name, phone..."
                  value={bookSearchTerm}
                  onChange={(e) => setBookSearchTerm(e.target.value)}
                  className="form-control"
                  style={{ paddingLeft: '36px', paddingRight: '12px', width: '100%', borderRadius: '8px' }}
                />
              </div>

              {/* Product Filter */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Milk size={16} color="var(--text-muted)" />
                <select
                  value={bookProductFilter}
                  onChange={(e) => setBookProductFilter(e.target.value)}
                  className="form-control"
                  style={{ padding: '6px 10px', fontSize: '13px', borderRadius: '8px', minWidth: '160px' }}
                >
                  <option value="ALL">All Milk Products</option>
                  <option value="UNIVERSAL">Universal / General Only</option>
                  {allProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.variant_label || ''})
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div style={{ display: 'flex', gap: '6px' }}>
                {['ALL', 'ACTIVE', 'EXHAUSTED', 'CANCELLED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setBookStatusFilter(st)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      border: bookStatusFilter === st ? 'none' : '1px solid var(--border-color)',
                      background:
                        bookStatusFilter === st
                          ? (st === 'ACTIVE' ? '#16a34a' : st === 'EXHAUSTED' ? '#dc2626' : st === 'CANCELLED' ? '#64748b' : 'var(--primary)')
                          : 'transparent',
                      color: bookStatusFilter === st ? '#fff' : 'var(--text-secondary)'
                    }}
                  >
                    {st === 'ALL' ? 'All Status' : st}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <button
                onClick={() => handleOpenIssueModal()}
                className="btn btn-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#d97706',
                  borderColor: '#d97706',
                  color: '#fff',
                  fontSize: '13px',
                  padding: '8px 14px'
                }}
              >
                <Plus size={16} />
                Add Coupon Book
              </button>
            </div>
          </div>

          {/* All Books Table */}
          <div style={{ background: '#ffffff', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <th style={{ padding: '12px 14px' }}>Book #</th>
                    <th style={{ padding: '12px 14px' }}>Customer</th>
                    <th style={{ padding: '12px 14px' }}>Milk Product</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>Issue Date</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>Total</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>Used</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>Remaining</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Price Paid</th>
                    <th style={{ padding: '12px 14px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {booksLoading ? (
                    <tr>
                      <td colSpan="10" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                        Loading coupon books...
                      </td>
                    </tr>
                  ) : filteredBooks.length === 0 ? (
                    <tr>
                      <td colSpan="10" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <BookOpen size={32} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                        <p style={{ margin: 0, fontWeight: 500 }}>No coupon books found matching your criteria</p>
                      </td>
                    </tr>
                  ) : (
                    filteredBooks.map((b) => (
                      <tr
                        key={b.id}
                        style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s ease' }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,0,0,0.02)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '12px 14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {b.book_number}
                          {b.notes && (
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 400, marginTop: '2px' }}>
                              {b.notes}
                            </div>
                          )}
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ fontWeight: 600 }}>{b.customer_name}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {b.customer_phone} {b.zone_name ? `• ${b.zone_name}` : ''}
                          </div>
                        </td>

                        <td style={{ padding: '12px 14px' }}>
                          {b.product_name ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                background: '#eff6ff',
                                color: '#1e40af',
                                border: '1px solid #bfdbfe'
                              }}
                            >
                              🥛 {b.product_name} {b.product_variant ? `(${b.product_variant})` : ''}
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '3px 8px',
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: 600,
                                background: '#f8fafc',
                                color: '#475569',
                                border: '1px solid #cbd5e1'
                              }}
                            >
                              🎟️ Universal / All Milk
                            </span>
                          )}
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          {b.issue_date}
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'center', fontWeight: 600 }}>
                          {b.total_coupons}
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'center', color: '#4f46e5', fontWeight: 600 }}>
                          {b.used_coupons}
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontWeight: 700,
                              fontSize: '13px',
                              background: b.remaining_coupons === 0 ? '#fee2e2' : b.remaining_coupons <= 5 ? '#fef3c7' : '#dcfce7',
                              color: b.remaining_coupons === 0 ? '#991b1b' : b.remaining_coupons <= 5 ? '#92400e' : '#166534'
                            }}
                          >
                            {b.remaining_coupons}
                          </span>
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ fontWeight: 600 }}>₹{b.price_paid || 0}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{b.payment_method}</div>
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '10px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background:
                                b.status === 'ACTIVE'
                                  ? '#dcfce7'
                                  : b.status === 'EXHAUSTED'
                                  ? '#fee2e2'
                                  : '#f1f5f9',
                              color:
                                b.status === 'ACTIVE'
                                  ? '#166534'
                                  : b.status === 'EXHAUSTED'
                                  ? '#991b1b'
                                  : '#475569'
                            }}
                          >
                            {b.status}
                          </span>
                        </td>

                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                            <button
                              onClick={() => handleOpenEditModal(b)}
                              className="btn btn-outline"
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                color: '#2563eb',
                                borderColor: '#93c5fd'
                              }}
                              title="Edit / Modify Coupon Book"
                            >
                              <Edit size={13} />
                              Edit
                            </button>

                            <button
                              onClick={() => handleDeleteBook(b.id, b.book_number)}
                              className="btn btn-outline"
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                color: '#dc2626',
                                borderColor: '#fca5a5'
                              }}
                              title="Delete / Void Coupon Book"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: Issue New Coupon Book */}
      {/* ========================================================================= */}
      {showIssueModal && (
        <div
          className="coupon-modal-backdrop"
          onClick={() => setShowIssueModal(false)}
        >
          <div
            className="coupon-modal-content"
            style={{ width: '100%', maxWidth: '580px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fffbeb', backgroundColor: '#fffbeb' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706' }}>
                  <Ticket size={22} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#92400e' }}>
                    Issue New Coupon Book
                  </h3>
                  <div style={{ fontSize: '12px', color: '#b45309' }}>
                    Select milk product, assign coupons, and record advance payment (with delivery charge)
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowIssueModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleIssueSubmit} className="coupon-modal-form">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Customer Selector */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>
                      Customer *
                    </label>
                    {issueCustomerSearch && (
                      <button
                        type="button"
                        onClick={() => setIssueCustomerSearch('')}
                        style={{ background: 'none', border: 'none', color: '#d97706', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Clear Filter
                      </button>
                    )}
                  </div>

                  <div style={{ position: 'relative', marginBottom: '8px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search customer by name, phone, flat or zone..."
                      value={issueCustomerSearch}
                      onChange={(e) => setIssueCustomerSearch(e.target.value)}
                      style={{ paddingLeft: '32px', fontSize: '13px', paddingBlock: '8px', width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    />
                  </div>

                  <select
                    className="form-control"
                    value={issueForm.customer_id}
                    onChange={(e) => {
                      const id = e.target.value;
                      const c = allCustomers.find(item => item.id === parseInt(id, 10));
                      const selectedProd = allProducts.find(p => p.id === parseInt(issueForm.product_id, 10));
                      const total = parseInt(issueForm.total_coupons, 10) || 30;
                      const { totalRate } = calculateCouponRate(selectedProd, c);
                      setIssueForm({
                        ...issueForm,
                        customer_id: id,
                        price_paid: parseFloat((total * totalRate).toFixed(2)),
                        book_number: `BK-${id || '001'}-${new Date().toISOString().slice(5, 7)}${Math.floor(100 + Math.random() * 900)}`
                      });
                      setSelectedCustomer(c || null);
                    }}
                    required
                    style={{ width: '100%', borderRadius: '8px', padding: '10px', background: '#ffffff', backgroundColor: '#ffffff' }}
                  >
                    <option value="">-- Choose Customer --</option>
                    {allCustomers
                      .filter(c => {
                        if (!issueCustomerSearch.trim()) return true;
                        const q = issueCustomerSearch.toLowerCase();
                        return (c.name || '').toLowerCase().includes(q) ||
                               (c.phone || '').includes(q) ||
                               (c.flat_no || '').toLowerCase().includes(q) ||
                               (c.zone_name || '').toLowerCase().includes(q);
                      })
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.phone}) - {c.zone_name || 'No Zone'} {c.billing_type === 'COUPON' ? '★ COUPON' : ''}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Milk Product Selection */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Milk Product (Allows 2+ Different Product Coupons) *
                  </label>
                  <select
                    className="form-control"
                    value={issueForm.product_id}
                    onChange={(e) => handleIssueProductChange(e.target.value)}
                    style={{ width: '100%', borderRadius: '8px', padding: '10px', background: '#ffffff', backgroundColor: '#ffffff' }}
                  >
                    <option value="">🎟️ All Products / Universal Milk Coupons (General)</option>
                    {allProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        🥛 {p.name} {p.variant_label ? `(${p.variant_label})` : ''} - ₹{p.selling_price}/unit
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Selecting a product reserves coupons strictly for that milk variety during daily delivery deductions.
                  </div>
                </div>

                {/* Book Number & Total Coupons */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Book Number *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={issueForm.book_number}
                      onChange={(e) => setIssueForm({ ...issueForm, book_number: e.target.value })}
                      placeholder="e.g. BK-TM-2026-001"
                      required
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Total Coupons in Book *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      className="form-control"
                      value={issueForm.total_coupons}
                      onChange={(e) => handleIssueTotalChange(e.target.value)}
                      required
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    />
                  </div>
                </div>

                {/* Quick Coupon Presets */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Quick Presets:</span>
                  {[30, 50, 60, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleIssueTotalChange(preset)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        background: issueForm.total_coupons === preset ? '#d97706' : '#f1f5f9',
                        color: issueForm.total_coupons === preset ? '#fff' : 'var(--text-secondary)',
                        border: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      {preset} coupons
                    </button>
                  ))}
                </div>

                {/* Advance Price Paid & Payment Mode */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Advance Amount Paid (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="form-control"
                      value={issueForm.price_paid}
                      onChange={(e) => setIssueForm({ ...issueForm, price_paid: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff', fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Payment Method
                    </label>
                    <select
                      className="form-control"
                      value={issueForm.payment_method}
                      onChange={(e) => setIssueForm({ ...issueForm, payment_method: e.target.value })}
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    >
                      <option value="CASH">CASH</option>
                      <option value="UPI">UPI / GooglePay / PhonePe</option>
                      <option value="BANK_TRANSFER">Bank Transfer (NEFT/IMPS)</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>
                </div>

                {/* Delivery Charge & Milk Rate Breakdown Box */}
                {(() => {
                  const selectedProd = allProducts.find(p => p.id === parseInt(issueForm.product_id, 10));
                  const targetCust = allCustomers.find(c => c.id === parseInt(issueForm.customer_id, 10)) || selectedCustomer;
                  const { unitPrice, delCharge, totalRate } = calculateCouponRate(selectedProd, targetCust);
                  const totalQty = parseInt(issueForm.total_coupons, 10) || 0;
                  const prodLabel = selectedProd ? `${selectedProd.name} ${selectedProd.variant_label ? `(${selectedProd.variant_label})` : ''}` : 'Universal Milk (500ml)';
                  return (
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#166534' }}>
                      <div style={{ fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}>
                        <span>🥛 Payment Rate Breakdown (Milk + Normal Delivery Charge):</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>Milk Product Price ({prodLabel}):</span>
                        <strong>₹{unitPrice.toFixed(2)} / packet</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>Normal Milk Delivery Charge:</span>
                        <strong>+ ₹{delCharge.toFixed(2)} / packet</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px dashed #86efac', fontWeight: 700, fontSize: '13px' }}>
                        <span>Total Rate per Packet / Coupon:</span>
                        <span>₹{totalRate.toFixed(2)}</span>
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#15803d', background: '#dcfce7', padding: '4px 8px', borderRadius: '4px' }}>
                        ✓ Normal milk delivery charges included: <strong>{totalQty} coupons × ₹{totalRate.toFixed(2)} = ₹{(totalQty * totalRate).toFixed(2)}</strong>
                      </div>
                    </div>
                  );
                })()}

                {/* Issue Date & Notes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Issue Date
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={issueForm.issue_date}
                      onChange={(e) => setIssueForm({ ...issueForm, issue_date: e.target.value })}
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Notes / Remarks
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Optional notes..."
                      value={issueForm.notes}
                      onChange={(e) => setIssueForm({ ...issueForm, notes: e.target.value })}
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    />
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', border: '1px solid #e2e8f0' }}>
                  💡 <strong>Automatic Balance Sync:</strong> Adding this book will immediately add <strong>+{issueForm.total_coupons || 0} coupons</strong> to the customer's balance and record an advance receipt for <strong>₹{issueForm.price_paid || 0}</strong>.
                </div>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowIssueModal(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ background: '#d97706', borderColor: '#d97706' }}
                >
                  {saving ? 'Issuing...' : 'Confirm & Issue Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: Edit / Modify Coupon Book */}
      {/* ========================================================================= */}
      {showEditModal && (
        <div
          className="coupon-modal-backdrop"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="coupon-modal-content"
            style={{ width: '100%', maxWidth: '580px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', backgroundColor: '#eff6ff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                  <Edit size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#1e40af' }}>
                    Edit Coupon Book #{editBookForm.book_number}
                  </h3>
                  <div style={{ fontSize: '12px', color: '#3b82f6' }}>
                    Customer: {editBookForm.customer_name}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#1e40af' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="coupon-modal-form">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Book Number & Product */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Book Number *
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={editBookForm.book_number}
                      onChange={(e) => setEditBookForm({ ...editBookForm, book_number: e.target.value })}
                      required
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Milk Product
                    </label>
                    <select
                      className="form-control"
                      value={editBookForm.product_id}
                      onChange={(e) => {
                        const newProdId = e.target.value;
                        const p = allProducts.find(item => item.id === parseInt(newProdId, 10));
                        const targetCust = allCustomers.find(c => c.id === parseInt(editBookForm.customer_id, 10)) || selectedCustomer;
                        const { totalRate } = calculateCouponRate(p, targetCust);
                        const tot = parseInt(editBookForm.total_coupons, 10) || 0;
                        setEditBookForm({
                          ...editBookForm,
                          product_id: newProdId,
                          price_paid: parseFloat((tot * totalRate).toFixed(2))
                        });
                      }}
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    >
                      <option value="">🎟️ Universal / All Milk</option>
                      {allProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          🥛 {p.name} {p.variant_label ? `(${p.variant_label})` : ''} - ₹{p.selling_price}/unit
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Total, Used, Remaining */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Total Coupons *
                    </label>
                    <input
                      type="number"
                      min="1"
                      className="form-control"
                      value={editBookForm.total_coupons}
                      onChange={(e) => {
                        const tot = parseInt(e.target.value, 10) || 0;
                        setEditBookForm({
                          ...editBookForm,
                          total_coupons: tot,
                          remaining_coupons: Math.max(0, tot - editBookForm.used_coupons)
                        });
                      }}
                      required
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Used Coupons
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      value={editBookForm.used_coupons}
                      onChange={(e) => {
                        const used = parseInt(e.target.value, 10) || 0;
                        setEditBookForm({
                          ...editBookForm,
                          used_coupons: used,
                          remaining_coupons: Math.max(0, editBookForm.total_coupons - used)
                        });
                      }}
                      required
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#16a34a', marginBottom: '6px' }}>
                      Remaining Leftover *
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="form-control"
                      value={editBookForm.remaining_coupons}
                      onChange={(e) => {
                        const rem = parseInt(e.target.value, 10) || 0;
                        setEditBookForm({
                          ...editBookForm,
                          remaining_coupons: rem,
                          used_coupons: Math.max(0, editBookForm.total_coupons - rem)
                        });
                      }}
                      required
                      style={{ width: '100%', borderRadius: '8px', fontWeight: 700, color: '#16a34a', background: '#ffffff', backgroundColor: '#ffffff' }}
                    />
                  </div>
                </div>

                {/* Price, Payment Method, Status */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Price Paid (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      className="form-control"
                      value={editBookForm.price_paid}
                      onChange={(e) => setEditBookForm({ ...editBookForm, price_paid: parseFloat(e.target.value) || 0 })}
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff', fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Payment Method
                    </label>
                    <select
                      className="form-control"
                      value={editBookForm.payment_method}
                      onChange={(e) => setEditBookForm({ ...editBookForm, payment_method: e.target.value })}
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    >
                      <option value="CASH">CASH</option>
                      <option value="UPI">UPI</option>
                      <option value="BANK_TRANSFER">Bank Transfer</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Status
                    </label>
                    <select
                      className="form-control"
                      value={editBookForm.status}
                      onChange={(e) => setEditBookForm({ ...editBookForm, status: e.target.value })}
                      style={{ width: '100%', borderRadius: '8px', fontWeight: 600, background: '#ffffff', backgroundColor: '#ffffff' }}
                    >
                      <option value="ACTIVE">ACTIVE</option>
                      <option value="EXHAUSTED">EXHAUSTED</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </div>
                </div>

                {/* Delivery Charge Breakdown & Recalculate helper in Edit Modal */}
                {(() => {
                  const selectedProd = allProducts.find(p => p.id === parseInt(editBookForm.product_id, 10));
                  const targetCust = allCustomers.find(c => c.id === parseInt(editBookForm.customer_id, 10)) || selectedCustomer;
                  const { unitPrice, delCharge, totalRate } = calculateCouponRate(selectedProd, targetCust);
                  const totalQty = parseInt(editBookForm.total_coupons, 10) || 0;
                  const standardTotal = parseFloat((totalQty * totalRate).toFixed(2));
                  const prodLabel = selectedProd ? `${selectedProd.name} ${selectedProd.variant_label ? `(${selectedProd.variant_label})` : ''}` : 'Universal Milk (500ml)';
                  return (
                    <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px 14px', fontSize: '12px', color: '#1e40af' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>
                          🥛 Milk Rate Breakdown (Includes Normal Delivery Charge):
                        </span>
                        {editBookForm.price_paid !== standardTotal && (
                          <button
                            type="button"
                            onClick={() => setEditBookForm({ ...editBookForm, price_paid: standardTotal })}
                            style={{
                              background: '#2563eb',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '4px 10px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer'
                            }}
                          >
                            Apply Rate ₹{standardTotal}
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>Milk Price ({prodLabel}):</span>
                        <strong>₹{unitPrice.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span>Normal Milk Delivery Charge:</span>
                        <strong>+ ₹{delCharge.toFixed(2)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: '1px dashed #93c5fd', fontWeight: 700, fontSize: '13px' }}>
                        <span>Total Rate per Packet / Coupon:</span>
                        <span>₹{totalRate.toFixed(2)}</span>
                      </div>
                      <div style={{ marginTop: '6px', fontSize: '11px', color: '#1d4ed8' }}>
                        Standard Total: {totalQty} coupons × ₹{totalRate.toFixed(2)} = <strong>₹{standardTotal.toFixed(2)}</strong>
                      </div>
                    </div>
                  );
                })()}

                {/* Issue Date & Notes */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Issue Date
                    </label>
                    <input
                      type="date"
                      className="form-control"
                      value={editBookForm.issue_date}
                      onChange={(e) => setEditBookForm({ ...editBookForm, issue_date: e.target.value })}
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Notes / Remarks
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      value={editBookForm.notes}
                      onChange={(e) => setEditBookForm({ ...editBookForm, notes: e.target.value })}
                      placeholder="Optional notes..."
                      style={{ width: '100%', borderRadius: '8px', background: '#ffffff', backgroundColor: '#ffffff' }}
                    />
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)', border: '1px solid #e2e8f0' }}>
                  💡 <strong>Automatic Recalculation:</strong> Updating remaining coupons here will automatically sync the customer's total coupon balance.
                </div>
              </div>

              <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="btn btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ background: '#2563eb', borderColor: '#2563eb' }}
                >
                  {saving ? 'Saving...' : 'Save & Update Book'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: Customer Coupon History & Breakdown */}
      {/* ========================================================================= */}
      {showHistoryModal && (
        <div
          className="coupon-modal-backdrop"
          onClick={() => setShowHistoryModal(false)}
        >
          <div
            className="coupon-modal-content"
            style={{ width: '100%', maxWidth: '800px', maxHeight: '88vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Coupon Books & Usage: {selectedCustomer?.customerName || selectedCustomer?.name}
                </h3>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Live Balance: <strong style={{ color: '#16a34a', fontSize: '15px' }}>{customerHistory?.summary?.remainingCoupons || 0} coupons</strong>
                </div>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
              {historyLoading ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                  Loading history...
                </div>
              ) : !customerHistory ? (
                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  No history available.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Summary row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Books Issued</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{customerHistory.summary?.totalBooks || 0}</div>
                    </div>
                    <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Total Issued</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{customerHistory.summary?.totalCouponsIssued || 0}</div>
                    </div>
                    <div style={{ background: '#dcfce7', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>Total Remaining</div>
                      <div style={{ fontSize: '18px', fontWeight: 700, color: '#16a34a' }}>{customerHistory.summary?.remainingCoupons || 0}</div>
                    </div>
                  </div>

                  {/* Per-Product Balances Chips */}
                  {customerHistory.productBalances && customerHistory.productBalances.length > 0 && (
                    <div style={{ background: '#eff6ff', padding: '14px', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#1e40af', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Milk Product Specific Balances
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {customerHistory.productBalances.map((pb, idx) => (
                          <div
                            key={idx}
                            style={{
                              background: '#fff',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              border: '1px solid #93c5fd',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px',
                              fontSize: '13px'
                            }}
                          >
                            <span style={{ fontWeight: 600, color: '#1e3a8a' }}>🥛 {pb.productName}</span>
                            <span style={{ background: '#2563eb', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontWeight: 700, fontSize: '12px' }}>
                              {pb.remainingCoupons} left
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Issued Books Table */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        Issued Coupon Books
                      </h4>
                      <button
                        onClick={() => handleOpenIssueModal(selectedCustomer)}
                        style={{ background: 'none', border: 'none', color: '#d97706', fontSize: '12px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Plus size={14} /> Add Another Book
                      </button>
                    </div>

                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Book #</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Milk Product</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center' }}>Total</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center' }}>Used</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center' }}>Left</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Price Paid</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center' }}>Status</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Edit</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(customerHistory.books || []).map((b) => (
                            <tr key={b.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{b.book_number}</td>
                              <td style={{ padding: '8px 12px' }}>
                                {b.product_name ? (
                                  <span style={{ fontSize: '11px', background: '#eff6ff', color: '#1e40af', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                    🥛 {b.product_name}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '11px', background: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px' }}>
                                    Universal
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>{b.total_coupons}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', color: '#4f46e5' }}>{b.used_coupons}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color: '#16a34a' }}>{b.remaining_coupons}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' }}>₹{b.price_paid || 0}</td>
                              <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                <span style={{
                                  padding: '1px 6px',
                                  borderRadius: '8px',
                                  fontSize: '10px',
                                  fontWeight: 600,
                                  background: b.status === 'ACTIVE' ? '#dcfce7' : '#fee2e2',
                                  color: b.status === 'ACTIVE' ? '#166534' : '#991b1b'
                                }}>
                                  {b.status}
                                </span>
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                                <button
                                  onClick={() => handleOpenEditModal(b)}
                                  style={{
                                    background: 'none',
                                    border: 'none',
                                    color: '#2563eb',
                                    cursor: 'pointer',
                                    padding: '2px 4px'
                                  }}
                                  title="Edit Book"
                                >
                                  <Edit size={14} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Transaction History Log */}
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
                      Recent Usage & Deductions (Last 50 entries)
                    </h4>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden', maxHeight: '220px', overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Date</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Type</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left' }}>Description</th>
                            <th style={{ padding: '8px 12px', textAlign: 'center' }}>Change</th>
                            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(customerHistory.transactions || []).map((tx) => (
                            <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '8px 12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{tx.transaction_date}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <span
                                  style={{
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontSize: '10px',
                                    fontWeight: 600,
                                    background:
                                      tx.transaction_type === 'BOOK_PURCHASE'
                                        ? '#dcfce7'
                                        : tx.transaction_type === 'DELIVERY_USAGE'
                                        ? '#fee2e2'
                                        : '#e0e7ff',
                                    color:
                                      tx.transaction_type === 'BOOK_PURCHASE'
                                        ? '#166534'
                                        : tx.transaction_type === 'DELIVERY_USAGE'
                                        ? '#991b1b'
                                        : '#3730a3'
                                  }}
                                >
                                  {tx.transaction_type}
                                </span>
                              </td>
                              <td style={{ padding: '8px 12px', color: 'var(--text-secondary)' }}>{tx.notes}</td>
                              <td
                                style={{
                                  padding: '8px 12px',
                                  textAlign: 'center',
                                  fontWeight: 700,
                                  color: tx.change_amount > 0 ? '#16a34a' : '#dc2626'
                                }}
                              >
                                {tx.change_amount > 0 ? `+${tx.change_amount}` : tx.change_amount}
                              </td>
                              <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{tx.balance_after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowHistoryModal(false)} className="btn btn-outline">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: Manual Adjustment */}
      {/* ========================================================================= */}
      {showAdjustModal && (
        <div
          className="coupon-modal-backdrop"
          onClick={() => setShowAdjustModal(false)}
        >
          <div
            className="coupon-modal-content"
            style={{ width: '100%', maxWidth: '460px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', backgroundColor: '#f8fafc' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                Manual Coupon Adjustment
              </h3>
              <button onClick={() => setShowAdjustModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAdjustSubmit} className="coupon-modal-form" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Customer
                  </label>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {selectedCustomer?.customerName || selectedCustomer?.name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Current Remaining Balance: <strong>{selectedCustomer?.remainingCoupons || selectedCustomer?.coupon_balance || 0} coupons</strong>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Adjustment Amount (+ to add, - to subtract) *
                  </label>
                  <input
                    type="number"
                    className="form-control"
                    value={adjustForm.change_amount}
                    onChange={(e) => setAdjustForm({ ...adjustForm, change_amount: parseInt(e.target.value, 10) || 0 })}
                    required
                    style={{ width: '100%', borderRadius: '8px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Reason for Adjustment *
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. Lost coupon replacement, physical count correction"
                    value={adjustForm.reason}
                    onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                    required
                    style={{ width: '100%', borderRadius: '8px' }}
                  />
                </div>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowAdjustModal(false)} className="btn btn-outline">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Saving...' : 'Apply Adjustment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
