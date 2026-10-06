import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import html2canvas from 'html2canvas';
import {
  Printer,
  User,
  Package,
  Plus,
  Trash2,
  RefreshCw,
  MessageCircle,
  Download,
  Calendar,
  CheckCircle2,
  Check,
  CalendarDays,
  Sparkles
} from 'lucide-react';
import Modal from '../../components/common/Modal';
import { getLocalDateString } from '../../utils/dateUtils';

export default function MonthlyBillGeneratePage() {
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [businessProfile, setBusinessProfile] = useState({});
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => getLocalDateString().slice(0, 7)); // YYYY-MM
  const [defaultMonthDays, setDefaultMonthDays] = useState(31);
  const [items, setItems] = useState([]); // Array of { productId, productName, variantLabel, unitVolumeLitres, unitPrice, quantity, days, startDate, endDate, selectedDays }
  
  // Calendar Modal State
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(null);
  const [tempSelectedDays, setTempSelectedDays] = useState([]);
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');

  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  // Calculate days in month whenever selectedMonth changes
  useEffect(() => {
    if (selectedMonth) {
      const [year, month] = selectedMonth.split('-').map(Number);
      const totalDays = new Date(year, month, 0).getDate();
      setDefaultMonthDays(totalDays);
    }
  }, [selectedMonth]);

  // Load Customers, Products & Business Profile on mount
  useEffect(() => {
    loadInitialData();
  }, []);

  const getDaysArray = (count, start = 1) => {
    const arr = [];
    for (let i = start; i <= count; i++) {
      arr.push(i);
    }
    return arr;
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const [custRes, prodRes, profileRes] = await Promise.all([
        api.get('/customers'),
        api.get('/products'),
        api.get('/profile').catch(() => ({}))
      ]);

      setCustomers(custRes || []);
      setProducts(prodRes || []);
      setBusinessProfile(profileRes || {});

      if (custRes && custRes.length > 0) {
        handleSelectCustomer(custRes[0].id, custRes, prodRes || []);
      }
    } catch (err) {
      console.error('Failed to load customers or products:', err);
    } finally {
      setLoading(false);
    }
  };

  const calculateDefaultDaysForCustomer = (cust, yearMonth = selectedMonth) => {
    const [year, month] = yearMonth.split('-').map(Number);
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    
    // Check if customer has subscription start_date in this month
    let startDay = 1;
    let endDay = totalDaysInMonth;

    if (cust && cust.subscriptions && cust.subscriptions.length > 0) {
      const sub = cust.subscriptions[0];
      if (sub.start_date && sub.start_date.startsWith(yearMonth)) {
        const d = parseInt(sub.start_date.split('-')[2], 10);
        if (d >= 1 && d <= totalDaysInMonth) {
          startDay = d;
        }
      }
    }

    const selectedDays = [];
    for (let d = startDay; d <= endDay; d++) {
      selectedDays.push(d);
    }

    const pad = (n) => String(n).padStart(2, '0');
    return {
      days: selectedDays.length,
      startDate: `${yearMonth}-${pad(startDay)}`,
      endDate: `${yearMonth}-${pad(endDay)}`,
      selectedDays
    };
  };

  const handleSelectCustomer = (custId, custList = customers, prodList = products) => {
    setSelectedCustomerId(custId);
    const cust = custList.find(c => String(c.id) === String(custId));
    if (!cust) return;

    const defaultDayInfo = calculateDefaultDaysForCustomer(cust, selectedMonth);

    if (cust.subscriptions && cust.subscriptions.length > 0) {
      const mapped = cust.subscriptions.map(s => {
        const prod = prodList.find(p => p.id === s.product_id) || {};
        
        let itemDayInfo = defaultDayInfo;
        if (s.start_date && s.start_date.startsWith(selectedMonth)) {
          const d = parseInt(s.start_date.split('-')[2], 10);
          const [year, month] = selectedMonth.split('-').map(Number);
          const totalDays = new Date(year, month, 0).getDate();
          const subDays = [];
          for (let day = d; day <= totalDays; day++) subDays.push(day);
          const pad = (n) => String(n).padStart(2, '0');
          itemDayInfo = {
            days: subDays.length,
            startDate: `${selectedMonth}-${pad(d)}`,
            endDate: `${selectedMonth}-${pad(totalDays)}`,
            selectedDays: subDays
          };
        }

        const chargeType = s.delivery_charge_type || prod.delivery_charge_type || 'MILK_RULE';
        const fixedCharge = s.fixed_delivery_charge !== undefined
          ? s.fixed_delivery_charge
          : (prod.fixed_delivery_charge !== undefined ? prod.fixed_delivery_charge : 0);

        return {
          productId: s.product_id,
          productName: s.product_name || prod.name || 'Milk Product',
          variantLabel: s.variant_label || prod.variant_label || 'Pkt',
          unitVolumeLitres: prod.unit_volume_litres || s.unit_volume_litres || 0.5,
          unitPrice: s.selling_price || prod.selling_price || 0,
          quantity: s.quantity || 1,
          category: s.category || prod.category || 'Milk',
          deliveryChargeType: chargeType,
          fixedDeliveryCharge: fixedCharge,
          days: itemDayInfo.days,
          startDate: itemDayInfo.startDate,
          endDate: itemDayInfo.endDate,
          selectedDays: itemDayInfo.selectedDays
        };
      });
      setItems(mapped);
    } else if (prodList.length > 0) {
      const firstProd = prodList[0];
      setItems([{
        productId: firstProd.id,
        productName: firstProd.name,
        variantLabel: firstProd.variant_label,
        unitVolumeLitres: firstProd.unit_volume_litres || 0.5,
        unitPrice: firstProd.selling_price,
        quantity: 1,
        category: firstProd.category || 'Milk',
        deliveryChargeType: firstProd.delivery_charge_type || 'MILK_RULE',
        fixedDeliveryCharge: firstProd.fixed_delivery_charge !== undefined ? firstProd.fixed_delivery_charge : 0,
        days: defaultDayInfo.days,
        startDate: defaultDayInfo.startDate,
        endDate: defaultDayInfo.endDate,
        selectedDays: defaultDayInfo.selectedDays
      }]);
    }
  };

  const handleMonthChange = (newMonth) => {
    setSelectedMonth(newMonth);
    const [year, month] = newMonth.split('-').map(Number);
    const totalDays = new Date(year, month, 0).getDate();
    setDefaultMonthDays(totalDays);

    const cust = customers.find(c => String(c.id) === String(selectedCustomerId));
    const dayInfo = calculateDefaultDaysForCustomer(cust, newMonth);

    // Update all items for new month default
    setItems(prev => prev.map(it => ({
      ...it,
      days: dayInfo.days,
      startDate: dayInfo.startDate,
      endDate: dayInfo.endDate,
      selectedDays: dayInfo.selectedDays
    })));
  };

  const handleAddItem = () => {
    if (products.length === 0) return;
    const firstProd = products[0];
    const [year, month] = selectedMonth.split('-').map(Number);
    const totalDays = new Date(year, month, 0).getDate();
    const allDays = getDaysArray(totalDays);
    const pad = (n) => String(n).padStart(2, '0');

    setItems(prev => [
      ...prev,
      {
        productId: firstProd.id,
        productName: firstProd.name,
        variantLabel: firstProd.variant_label,
        unitVolumeLitres: firstProd.unit_volume_litres || 0.5,
        unitPrice: firstProd.selling_price,
        quantity: 1,
        category: firstProd.category || 'Milk',
        deliveryChargeType: firstProd.delivery_charge_type || 'MILK_RULE',
        fixedDeliveryCharge: firstProd.fixed_delivery_charge !== undefined ? firstProd.fixed_delivery_charge : 0,
        days: totalDays,
        startDate: `${selectedMonth}-01`,
        endDate: `${selectedMonth}-${pad(totalDays)}`,
        selectedDays: allDays
      }
    ]);
  };

  const handleRemoveItem = (index) => {
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleItemProductChange = (index, prodId) => {
    const prod = products.find(p => String(p.id) === String(prodId));
    if (!prod) return;

    setItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      return {
        ...item,
        productId: prod.id,
        productName: prod.name,
        variantLabel: prod.variant_label,
        unitVolumeLitres: prod.unit_volume_litres || 0.5,
        unitPrice: prod.selling_price,
        category: prod.category || 'Milk',
        deliveryChargeType: prod.delivery_charge_type || 'MILK_RULE',
        fixedDeliveryCharge: prod.fixed_delivery_charge !== undefined ? prod.fixed_delivery_charge : 0
      };
    }));
  };

  const handleItemQtyChange = (index, qty) => {
    const num = Math.max(1, parseInt(qty) || 1);
    setItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      return { ...item, quantity: num };
    }));
  };

  const handleItemDaysDirectChange = (index, daysVal) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const maxDays = new Date(year, month, 0).getDate();
    const num = Math.max(1, Math.min(maxDays, parseInt(daysVal) || 1));
    const pad = (n) => String(n).padStart(2, '0');

    // Default to first N days
    const newSelectedDays = [];
    for (let d = 1; d <= num; d++) newSelectedDays.push(d);

    setItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      return {
        ...item,
        days: num,
        startDate: `${selectedMonth}-01`,
        endDate: `${selectedMonth}-${pad(num)}`,
        selectedDays: newSelectedDays
      };
    }));
  };

  // -------------------------------------------------------------
  // CALENDAR MODAL SELECTION LOGIC
  // -------------------------------------------------------------
  const handleOpenCalendarModal = (index) => {
    const item = items[index];
    if (!item) return;

    setActiveItemIndex(index);
    setTempSelectedDays([...(item.selectedDays || getDaysArray(item.days || defaultMonthDays))]);
    setTempStartDate(item.startDate || `${selectedMonth}-01`);
    setTempEndDate(item.endDate || `${selectedMonth}-${String(defaultMonthDays).padStart(2, '0')}`);
    setCalendarModalOpen(true);
  };

  const toggleTempDay = (dayNumber) => {
    setTempSelectedDays(prev => {
      if (prev.includes(dayNumber)) {
        return prev.filter(d => d !== dayNumber);
      } else {
        return [...prev, dayNumber].sort((a, b) => a - b);
      }
    });
  };

  const applyRangeToTempDays = (start, end) => {
    if (!start || !end) return;
    const s = parseInt(start.split('-')[2], 10);
    const e = parseInt(end.split('-')[2], 10);
    if (isNaN(s) || isNaN(e) || s > e) return;

    const days = [];
    for (let d = s; d <= e; d++) {
      days.push(d);
    }
    setTempSelectedDays(days);
    setTempStartDate(start);
    setTempEndDate(end);
  };

  const setPresetDays = (presetType) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const totalDays = new Date(year, month, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');

    if (presetType === 'FULL') {
      const all = getDaysArray(totalDays);
      setTempSelectedDays(all);
      setTempStartDate(`${selectedMonth}-01`);
      setTempEndDate(`${selectedMonth}-${pad(totalDays)}`);
    } else if (presetType === 'FIRST_HALF') {
      const first15 = getDaysArray(Math.min(15, totalDays));
      setTempSelectedDays(first15);
      setTempStartDate(`${selectedMonth}-01`);
      setTempEndDate(`${selectedMonth}-15`);
    } else if (presetType === 'SECOND_HALF') {
      const secondHalf = [];
      for (let d = 16; d <= totalDays; d++) secondHalf.push(d);
      setTempSelectedDays(secondHalf);
      setTempStartDate(`${selectedMonth}-16`);
      setTempEndDate(`${selectedMonth}-${pad(totalDays)}`);
    } else if (presetType === 'ODD') {
      const oddDays = [];
      for (let d = 1; d <= totalDays; d += 2) oddDays.push(d);
      setTempSelectedDays(oddDays);
    } else if (presetType === 'EVEN') {
      const evenDays = [];
      for (let d = 2; d <= totalDays; d += 2) evenDays.push(d);
      setTempSelectedDays(evenDays);
    } else if (presetType === 'CLEAR') {
      setTempSelectedDays([]);
    }
  };

  const handleSaveCalendarSelection = (applyToAll = false) => {
    const count = tempSelectedDays.length || 1;
    const sortedDays = [...tempSelectedDays].sort((a, b) => a - b);
    const pad = (n) => String(n).padStart(2, '0');
    const startStr = sortedDays.length > 0 ? `${selectedMonth}-${pad(sortedDays[0])}` : `${selectedMonth}-01`;
    const endStr = sortedDays.length > 0 ? `${selectedMonth}-${pad(sortedDays[sortedDays.length - 1])}` : `${selectedMonth}-${pad(defaultMonthDays)}`;

    setItems(prev => prev.map((item, idx) => {
      if (applyToAll || idx === activeItemIndex) {
        return {
          ...item,
          days: count,
          startDate: startStr,
          endDate: endStr,
          selectedDays: sortedDays
        };
      }
      return item;
    }));

    setCalendarModalOpen(false);
  };

  // -------------------------------------------------------------
  // EXACT BUSINESS RULES DELIVERY CHARGE & PRICE CALCULATION
  // -------------------------------------------------------------
  const selectedCustomer = customers.find(c => String(c.id) === String(selectedCustomerId)) || null;
  const isBulkHotel = selectedCustomer?.customer_category === 'BULK_HOTEL';

  // Calculate day-by-day delivery charges across all items
  // Accurately respects:
  // 1. Bulk / Hotel customers -> ₹0 delivery charges
  // 2. Fixed per unit products -> (fixedDeliveryCharge * quantity) strictly calculated per packet
  // 3. None products -> ₹0 delivery charge
  // 4. Milk rule products -> pooled milk volume (<=0.5L=₹2, >0.5L=litres*3) distributed proportionally
  const itemDelCharges = new Array(items.length).fill(0);

  if (!isBulkHotel && items.length > 0) {
    for (let d = 1; d <= defaultMonthDays; d++) {
      // Find items active on day d
      const activeIndices = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const days = it.days || defaultMonthDays;
        const isDayActive = Array.isArray(it.selectedDays) && it.selectedDays.length > 0
          ? it.selectedDays.includes(d)
          : d <= days;
        if (isDayActive && (it.quantity || 0) > 0) {
          activeIndices.push(i);
        }
      }

      if (activeIndices.length === 0) continue;

      // Group active items into milk rule items and other items
      const milkIndices = [];
      for (const idx of activeIndices) {
        const it = items[idx];
        const chargeType = it.deliveryChargeType || it.delivery_charge_type;
        const isMilkCat = Boolean(it.category && it.category.trim().toLowerCase() === 'milk');
        const isMilkRule = chargeType === 'MILK_RULE' || (!chargeType && isMilkCat);

        if (isMilkRule) {
          milkIndices.push(idx);
        } else {
          // Other items: FIXED_PER_UNIT or NONE
          if (chargeType === 'FIXED_PER_UNIT') {
            const fixedPerUnit = parseFloat(it.fixedDeliveryCharge !== undefined ? it.fixedDeliveryCharge : it.fixed_delivery_charge) || 0;
            const charge = parseFloat((fixedPerUnit * (it.quantity || 1)).toFixed(2));
            itemDelCharges[idx] += charge;
          } else {
            // NONE -> ₹0
          }
        }
      }

      // Calculate combined milk delivery charge for this day
      if (milkIndices.length > 0) {
        let dayMilkLitres = 0;
        for (const idx of milkIndices) {
          const it = items[idx];
          let vol = it.unitVolumeLitres;
          if (!vol || vol <= 0) {
            if (it.variantLabel && it.variantLabel.toLowerCase().includes('500')) vol = 0.5;
            else if (it.variantLabel && it.variantLabel.toLowerCase().includes('1')) vol = 1.0;
            else vol = 1.0;
          }
          dayMilkLitres += vol * (it.quantity || 1);
        }

        let dayMilkCharge = 0;
        if (dayMilkLitres > 0) {
          if (dayMilkLitres <= 0.5) {
            dayMilkCharge = 2.0;
          } else {
            dayMilkCharge = parseFloat((dayMilkLitres * 3.0).toFixed(2));
          }
        }

        // Distribute proportionally among active milk items on this day
        let remCharge = dayMilkCharge;
        for (let m = 0; m < milkIndices.length; m++) {
          const idx = milkIndices[m];
          const it = items[idx];
          let vol = it.unitVolumeLitres;
          if (!vol || vol <= 0) {
            if (it.variantLabel && it.variantLabel.toLowerCase().includes('500')) vol = 0.5;
            else if (it.variantLabel && it.variantLabel.toLowerCase().includes('1')) vol = 1.0;
            else vol = 1.0;
          }
          const itemVol = vol * (it.quantity || 1);

          let charge = 0;
          if (m === milkIndices.length - 1) {
            charge = parseFloat(remCharge.toFixed(2));
          } else {
            charge = dayMilkLitres > 0
              ? parseFloat(((itemVol / dayMilkLitres) * dayMilkCharge).toFixed(2))
              : 0;
            remCharge -= charge;
          }
          itemDelCharges[idx] += charge;
        }
      }
    }
  }

  const calculatedItems = items.map((item, idx) => {
    const itemDays = item.days || defaultMonthDays;
    const totalQty = (item.quantity || 1) * itemDays;
    const milkSubtotal = parseFloat(((item.unitPrice || 0) * (item.quantity || 1) * itemDays).toFixed(2));
    const deliveryChargeTotal = parseFloat((itemDelCharges[idx] || 0).toFixed(2));
    const lineTotal = parseFloat((milkSubtotal + deliveryChargeTotal).toFixed(2));
    const effectiveUnitPrice = totalQty > 0 ? parseFloat((lineTotal / totalQty).toFixed(2)) : (item.unitPrice || 0);

    return {
      ...item,
      itemDays,
      totalQty,
      milkSubtotal,
      deliveryChargeTotal,
      lineTotal,
      effectiveUnitPrice
    };
  });

  const totalMilkSubtotal = calculatedItems.reduce((acc, it) => acc + it.milkSubtotal, 0);
  const totalDeliveryCharges = calculatedItems.reduce((acc, it) => acc + it.deliveryChargeTotal, 0);
  const grossTotalBill = parseFloat((totalMilkSubtotal + totalDeliveryCharges).toFixed(2));

  // Invoice Number & Meta
  const invoiceNumber = `NB-${selectedMonth.replace('-', '')}-${selectedCustomer ? selectedCustomer.id.toString().padStart(4, '0') : '0001'}`;
  const currentDateStr = getLocalDateString();
  const currentTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // -------------------------------------------------------------
  // PRINT 1-SHEET INVOICE HANDLER
  // -------------------------------------------------------------
  const handlePrint = () => {
    const printElement = document.getElementById('printable-invoice-content');
    if (!printElement) return;

    let printIframe = document.getElementById('print-invoice-iframe');
    if (printIframe) printIframe.remove();

    printIframe = document.createElement('iframe');
    printIframe.id = 'print-invoice-iframe';
    printIframe.style.position = 'fixed';
    printIframe.style.right = '0';
    printIframe.style.bottom = '0';
    printIframe.style.width = '0';
    printIframe.style.height = '0';
    printIframe.style.border = '0';
    document.body.appendChild(printIframe);

    const doc = printIframe.contentWindow.document;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Invoice - ${invoiceNumber}</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4 portrait;
              margin: 8mm 10mm;
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            body {
              background: #ffffff;
              color: #1e293b;
              padding: 0;
              margin: 0;
              font-size: 0.813rem;
              line-height: 1.4;
            }
            .invoice-sheet {
              width: 100%;
              border: 1px solid #94a3b8;
              border-radius: 4px;
              padding: 20px 24px;
              background: #ffffff;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            .badge {
              display: inline-block;
              padding: 2px 8px;
              border-radius: 4px;
              font-weight: 700;
              font-size: 0.7rem;
            }
            .badge-success { background: #ecfdf5; color: #065f46; }
            .no-print { display: none !important; }
          </style>
        </head>
        <body>
          <div class="invoice-sheet">
            ${printElement.innerHTML}
          </div>
        </body>
      </html>
    `);
    doc.close();

    setTimeout(() => {
      printIframe.contentWindow.focus();
      printIframe.contentWindow.print();
    }, 350);
  };

  // -------------------------------------------------------------
  // SHARE WHATSAPP CALCULATION WITH INVOICE PICTURE
  // -------------------------------------------------------------
  const handleShareWhatsApp = async () => {
    if (!selectedCustomer) return;
    const phone = selectedCustomer.phone || '';
    if (!phone) {
      alert('Customer does not have a phone number');
      return;
    }

    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const phoneFormatted = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

    const itemsSummary = calculatedItems.map(it => 
      `• ${it.productName} (${it.variantLabel}) × ${it.quantity}/day for ${it.itemDays} days (${it.totalQty} total @ ₹${it.effectiveUnitPrice.toFixed(2)}) = ₹${it.lineTotal.toFixed(2)}`
    ).join('\n');

    let msg = `*NANDINI MILK PARLOUR — ADVANCE MONTHLY BILL*\n`;
    msg += `*Invoice No:* ${invoiceNumber}\n`;
    msg += `*Month:* ${selectedMonth}\n`;
    msg += `*Customer:* ${selectedCustomer.name}\n\n`;
    msg += `*Products & Schedule:* \n${itemsSummary}\n\n`;
    msg += `*Milk Subtotal:* ₹${totalMilkSubtotal.toFixed(2)}\n`;
    msg += `*Delivery Charges:* ₹${totalDeliveryCharges.toFixed(2)}\n`;
    msg += `*TOTAL AMOUNT TO PAY:* ₹${grossTotalBill.toFixed(2)}\n\n`;
    msg += `*Payment Details:*\n`;
    msg += `*Gpay / PhonePe / Paytm:* ${businessProfile.upi_phone || '7022754524'}\n`;
    if (businessProfile.upi_id) {
      msg += `*UPI ID:* ${businessProfile.upi_id}\n`;
    }
    msg += `\nThank you for choosing Nandini Milk Parlour! 🙏`;

    const invoiceElement = document.getElementById('printable-invoice-content');
    if (!invoiceElement) {
      window.open(`https://api.whatsapp.com/send?phone=${phoneFormatted}&text=${encodeURIComponent(msg)}`, '_blank');
      return;
    }

    try {
      setCapturing(true);
      const canvas = await html2canvas(invoiceElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
          window.open(`https://api.whatsapp.com/send?phone=${phoneFormatted}&text=${encodeURIComponent(msg)}`, '_blank');
          setCapturing(false);
          return;
        }

        const fileName = `Invoice_${invoiceNumber}.png`;
        const file = new File([blob], fileName, { type: 'image/png' });

        // 1. Mobile / Web Share API with File
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `Invoice ${invoiceNumber}`,
              text: msg,
              files: [file]
            });
            setCapturing(false);
            return;
          } catch (shareErr) {
            console.log('Native share canceled, using fallback:', shareErr);
          }
        }

        // 2. Desktop Fallback: Copy Image to Clipboard + Auto Download + Open WhatsApp
        try {
          if (navigator.clipboard && navigator.clipboard.write) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
          }
        } catch (clipErr) {
          console.log('Clipboard write note:', clipErr);
        }

        // Trigger automatic image download
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);

        setToastMsg('📸 Invoice picture copied to clipboard & downloaded! Simply press Ctrl+V in WhatsApp to send the invoice picture.');
        setTimeout(() => setToastMsg(''), 9000);

        // Open WhatsApp Web
        window.open(`https://api.whatsapp.com/send?phone=${phoneFormatted}&text=${encodeURIComponent(msg)}`, '_blank');
        setCapturing(false);
      }, 'image/png');
    } catch (err) {
      console.error('Invoice capture error:', err);
      window.open(`https://api.whatsapp.com/send?phone=${phoneFormatted}&text=${encodeURIComponent(msg)}`, '_blank');
      setCapturing(false);
    }
  };

  const handleDownloadImage = async () => {
    const invoiceElement = document.getElementById('printable-invoice-content');
    if (!invoiceElement) return;

    try {
      setCapturing(true);
      const canvas = await html2canvas(invoiceElement, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      canvas.toBlob((blob) => {
        if (!blob) {
          setCapturing(false);
          return;
        }
        const fileName = `Invoice_${invoiceNumber}.png`;
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 5000);
        setCapturing(false);
      }, 'image/png');
    } catch (err) {
      console.error('Download image error:', err);
      setCapturing(false);
    }
  };

  // Calendar Grid Helper for Modal
  const renderCalendarDaysGrid = () => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Sun, 1 = Mon ...
    const totalDays = new Date(year, month, 0).getDate();

    const blanks = Array.from({ length: firstDayIndex });
    const dayNumbers = Array.from({ length: totalDays }, (_, i) => i + 1);

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '6px' }}>
          {weekDays.map(wd => (
            <div key={wd} style={{ fontSize: '0.75rem', fontWeight: '800', color: wd === 'Sun' ? '#dc2626' : '#64748b' }}>
              {wd}
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
          {blanks.map((_, i) => (
            <div key={`blank-${i}`} style={{ height: '38px', background: 'transparent' }} />
          ))}
          {dayNumbers.map(d => {
            const isSelected = tempSelectedDays.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleTempDay(d)}
                style={{
                  height: '38px',
                  borderRadius: '6px',
                  border: isSelected ? '2px solid #0054a6' : '1px solid #e2e8f0',
                  background: isSelected ? '#0054a6' : '#ffffff',
                  color: isSelected ? '#ffffff' : '#1e293b',
                  fontWeight: isSelected ? '800' : '600',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.15s ease'
                }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const activeItem = activeItemIndex !== null ? items[activeItemIndex] : null;

  return (
    <div className="page-wrapper">
      {/* Top Customer / Requirement Control Bar */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', alignItems: 'flex-end' }}>
          <div>
            <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '800', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <User size={15} color="var(--primary)" /> Select Customer:
            </label>
            <select
              className="form-select"
              value={selectedCustomerId}
              onChange={(e) => handleSelectCustomer(e.target.value)}
              style={{ fontWeight: '700' }}
            >
              {customers.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone || 'No phone'}) - {c.route || 'General'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '800' }}>Billing Month:</label>
            <input
              type="month"
              className="form-input"
              value={selectedMonth}
              onChange={(e) => handleMonthChange(e.target.value)}
              style={{ fontWeight: '700' }}
            />
          </div>

          <div>
            <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '800' }}>Month Total Days:</label>
            <input
              type="number"
              disabled
              className="form-input"
              value={defaultMonthDays}
              style={{ fontWeight: '700', background: '#f1f5f9', color: '#475569' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleAddItem} className="btn btn-outline btn-sm" style={{ flex: 1 }}>
              <Plus size={15} /> Add Product
            </button>
            <button onClick={loadInitialData} className="btn btn-outline btn-sm" disabled={loading} title="Reload Data">
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </div>

        {/* Product Items Quick Edit Bar with Date / Days & Calendar Picker */}
        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Daily Milk Items (Configure Qty & Days / Calendar per Product):
            </span>
          </div>

          {items.map((item, idx) => {
            const calculated = calculatedItems[idx] || {};
            const itemDays = item.days || defaultMonthDays;
            
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: '#f8fafc',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0',
                  flexWrap: 'wrap'
                }}
              >
                {/* Product Dropdown */}
                <select
                  className="form-select"
                  style={{ fontSize: '0.813rem', padding: '5px 8px', minWidth: '220px', flex: '1 1 220px' }}
                  value={item.productId}
                  onChange={(e) => handleItemProductChange(idx, e.target.value)}
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.variant_label}) — MRP ₹{p.selling_price}
                    </option>
                  ))}
                </select>

                {/* Daily Qty Input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Daily Qty:</span>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    style={{ width: '56px', padding: '4px 6px', textAlign: 'center', fontWeight: '800' }}
                    value={item.quantity}
                    onChange={(e) => handleItemQtyChange(idx, e.target.value)}
                  />
                </div>

                {/* Days Input (Direct Number) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Days:</span>
                  <input
                    type="number"
                    min="1"
                    max={defaultMonthDays}
                    className="form-input"
                    style={{ width: '56px', padding: '4px 6px', textAlign: 'center', fontWeight: '800', color: '#0054a6', borderColor: '#93c5fd' }}
                    value={itemDays}
                    onChange={(e) => handleItemDaysDirectChange(idx, e.target.value)}
                    title={`Enter number of days (1-${defaultMonthDays}) for this product`}
                  />
                </div>

                {/* Calendar Date Picker Button */}
                <button
                  type="button"
                  onClick={() => handleOpenCalendarModal(idx)}
                  className="btn btn-outline btn-sm"
                  style={{
                    padding: '4px 10px',
                    fontSize: '0.78rem',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    background: '#eff6ff',
                    borderColor: '#93c5fd',
                    color: '#1d4ed8'
                  }}
                  title="Pick specific date range or toggle calendar days for this product"
                >
                  <Calendar size={14} color="#1d4ed8" />
                  <span>{itemDays} Days (Calendar)</span>
                </button>

                {/* Calculated Line Item Summary */}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '0.813rem', fontWeight: '700', color: '#0f172a' }}>
                    Total for {itemDays} Days: <strong>{item.quantity * itemDays} {item.variantLabel}</strong> (₹{(calculated.lineTotal || 0).toFixed(2)})
                  </span>
                  {items.length > 1 && (
                    <button
                      onClick={() => handleRemoveItem(idx)}
                      className="btn btn-outline btn-sm"
                      style={{ padding: '4px 6px', color: '#dc2626', borderColor: '#fecaca' }}
                      title="Remove Product Item"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Interactive Calendar Selection Modal */}
      <Modal
        isOpen={calendarModalOpen}
        onClose={() => setCalendarModalOpen(false)}
        title={activeItem ? `🗓️ Delivery Days Schedule — ${activeItem.productName}` : 'Select Delivery Days'}
        maxWidth="520px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Preset Quick Chips */}
          <div>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>Quick Presets:</span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                onClick={() => setPresetDays('FULL')}
              >
                Full Month ({defaultMonthDays}d)
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                onClick={() => setPresetDays('FIRST_HALF')}
              >
                1st – 15th
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                onClick={() => setPresetDays('SECOND_HALF')}
              >
                16th – End
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                onClick={() => setPresetDays('ODD')}
              >
                Alternate (Odd)
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.72rem', padding: '3px 8px' }}
                onClick={() => setPresetDays('EVEN')}
              >
                Alternate (Even)
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ fontSize: '0.72rem', padding: '3px 8px', color: '#dc2626', borderColor: '#fecaca' }}
                onClick={() => setPresetDays('CLEAR')}
              >
                Clear All
              </button>
            </div>
          </div>

          {/* Date Range Selection Box */}
          <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#475569', display: 'block', marginBottom: '6px' }}>
              Select Date Range:
            </span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <input
                  type="date"
                  className="form-input"
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                  value={tempStartDate}
                  onChange={(e) => setTempStartDate(e.target.value)}
                />
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#64748b' }}>to</span>
              <div style={{ flex: 1 }}>
                <input
                  type="date"
                  className="form-input"
                  style={{ fontSize: '0.8rem', padding: '4px 8px' }}
                  value={tempEndDate}
                  onChange={(e) => setTempEndDate(e.target.value)}
                />
              </div>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                onClick={() => applyRangeToTempDays(tempStartDate, tempEndDate)}
              >
                Apply Range
              </button>
            </div>
          </div>

          {/* Interactive Month Grid */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase' }}>
                Toggle Individual Days ({selectedMonth}):
              </span>
              <span style={{ fontSize: '0.78rem', fontWeight: '800', color: '#0054a6' }}>
                {tempSelectedDays.length} Days Selected
              </span>
            </div>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              {renderCalendarDaysGrid()}
            </div>
          </div>

          {/* Summary Box */}
          <div style={{ padding: '10px', background: '#ecfdf5', borderRadius: '6px', border: '1px solid #a7f3d0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#065f46' }}>
              Total Selected: <strong>{tempSelectedDays.length} Days</strong>
            </span>
            {activeItem && (
              <span style={{ fontSize: '0.82rem', fontWeight: '700', color: '#065f46' }}>
                Total Quantity: <strong>{activeItem.quantity * (tempSelectedDays.length || 1)} {activeItem.variantLabel}</strong>
              </span>
            )}
          </div>

          {/* Modal Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setCalendarModalOpen(false)}
            >
              Cancel
            </button>
            {items.length > 1 && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ color: '#0284c7', borderColor: '#7dd3fc' }}
                onClick={() => handleSaveCalendarSelection(true)}
              >
                Apply to All Products
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => handleSaveCalendarSelection(false)}
            >
              <Check size={14} /> Apply to This Product
            </button>
          </div>
        </div>
      </Modal>

      {/* Toast Notification for Clipboard / Share */}
      {toastMsg && (
        <div style={{
          marginBottom: '14px',
          padding: '10px 16px',
          background: '#ecfdf5',
          border: '1px solid #6ee7b7',
          borderRadius: '6px',
          color: '#065f46',
          fontWeight: '700',
          fontSize: '0.82rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 2px 8px rgba(16,185,129,0.15)'
        }}>
          <CheckCircle2 size={18} color="#059669" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* ACTION BAR: Print & Share */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: '800', margin: 0, color: 'var(--text-primary)' }}>
          Invoice Preview — {invoiceNumber}
        </h2>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleDownloadImage}
            className="btn btn-outline btn-sm"
            disabled={capturing || !selectedCustomer}
            title="Download Invoice as PNG Picture"
          >
            <Download size={15} /> {capturing ? 'Processing...' : 'Download Picture'}
          </button>
          <button
            onClick={handleShareWhatsApp}
            className="btn btn-outline btn-sm"
            style={{ color: '#16a34a', borderColor: '#86efac' }}
            disabled={capturing || !selectedCustomer}
            title="Take Invoice Picture and send directly on WhatsApp"
          >
            <MessageCircle size={15} /> {capturing ? 'Capturing Picture...' : 'Send on WhatsApp'}
          </button>
          <button onClick={handlePrint} className="btn btn-primary btn-sm" disabled={!selectedCustomer}>
            <Printer size={15} /> Print Bill (1 Sheet)
          </button>
        </div>
      </div>

      {/* EXACT IDENTICAL INVOICE SHEET (Matches BillInvoiceModal) */}
      <div id="printable-invoice-content" className="invoice-sheet" style={{
        background: 'white',
        border: '1px solid #cbd5e1',
        borderRadius: 'var(--radius-md)',
        padding: '24px 28px',
        color: '#1e293b',
        fontSize: '0.813rem',
        lineHeight: '1.4',
        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
        maxWidth: '850px',
        margin: '0 auto'
      }}>
        {/* Top Heading */}
        <div style={{ textAlign: 'center', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
          <span style={{ fontSize: '1.15rem', fontWeight: '800', letterSpacing: '0.12em', color: '#0054a6', textTransform: 'uppercase' }}>
            INVOICE
          </span>
        </div>

        {/* Business Header & Invoice Meta */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '12px', borderBottom: '2px solid #0054a6', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {(businessProfile.invoice_logo || businessProfile.business_logo) ? (
              <div style={{
                width: '56px',
                height: '56px',
                background: 'white',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                padding: '3px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                <img
                  src={businessProfile.invoice_logo || businessProfile.business_logo}
                  alt="Business Logo"
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            ) : null}
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: '900', color: '#0054a6', margin: 0, textTransform: 'uppercase' }}>
                {businessProfile.invoice_business_name || businessProfile.business_name || 'NANDINI MILK PARLOUR'}
              </h1>
              <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '3px' }}>
                {businessProfile.address && `${businessProfile.address}, `}{businessProfile.state || 'Karnataka'} {businessProfile.pincode && `- ${businessProfile.pincode}`}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#475569' }}>
                {businessProfile.phone && `Phone: ${businessProfile.phone}`} {businessProfile.email && ` | Email: ${businessProfile.email}`}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: '800', color: '#0f172a' }}>
              Invoice No: <span style={{ color: '#0054a6' }}>{invoiceNumber}</span>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
              Date: <strong>{currentDateStr}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
              Time: <strong>{currentTimeStr}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
              Month: <strong>{selectedMonth}</strong>
            </div>
            <div style={{ marginTop: '4px' }}>
              <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '3px 8px' }}>
                ADVANCE_PAID
              </span>
            </div>
          </div>
        </div>

        {/* Customer & Delivery Information */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '10px 12px', background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>BILL TO:</div>
            <div style={{ fontSize: '0.9rem', fontWeight: '800', color: '#0f172a', marginTop: '2px' }}>{selectedCustomer?.name || 'Customer'}</div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>Contact: {selectedCustomer?.phone || 'N/A'}</div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>Address: {selectedCustomer?.address || 'N/A'}</div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>DELIVERY DETAILS:</div>
            <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '2px' }}>
              Route: <strong>{selectedCustomer?.route || '3rd cross'}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
              Category: <strong>{selectedCustomer?.customer_category === 'BULK_HOTEL' ? 'Bulk / Commercial' : 'Household'}</strong>
            </div>
            <div style={{ fontSize: '0.78rem', color: '#475569' }}>
              Plan: <strong>Prepaid (Advance)</strong>
            </div>
          </div>
        </div>

        {/* Product Item Table */}
        <div style={{ marginBottom: '14px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #cbd5e1' }}>
                <th style={{ padding: '6px 8px', textAlign: 'center', width: '36px' }}>#</th>
                <th style={{ padding: '6px 8px', textAlign: 'left' }}>ITEM NAME</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', width: '80px' }}>QUANTITY</th>
                <th style={{ padding: '6px 8px', textAlign: 'center', width: '75px' }}>UNIT</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', width: '85px' }}>MRP (₹)</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', width: '85px' }}>PRICE (₹)</th>
                <th style={{ padding: '6px 8px', textAlign: 'right', width: '100px' }}>AMOUNT (₹)</th>
              </tr>
            </thead>
            <tbody>
              {calculatedItems.map((item, idx) => {
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b' }}>{idx + 1}</td>
                    <td style={{ padding: '6px 8px', fontWeight: '600' }}>
                      {item.productName}
                      <span style={{ fontSize: '0.72rem', color: '#64748b', marginLeft: '6px', fontWeight: 'normal' }}>
                        ({item.itemDays} days @ {item.quantity}/day)
                      </span>
                    </td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', fontWeight: '700' }}>{item.totalQty}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b' }}>{item.variantLabel}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right' }}>{item.unitPrice.toFixed(2)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '600' }}>{item.effectiveUnitPrice.toFixed(2)}</td>
                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: '700' }}>{item.lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Bill Summary Breakdown Card */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '14px' }}>
          <div style={{ width: '310px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
              <span style={{ color: '#64748b' }}>Sub Total (Milk & Delivery):</span>
              <span style={{ fontWeight: '600' }}>₹{grossTotalBill.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '3px' }}>
              <span style={{ color: '#64748b' }}>Round Off:</span>
              <span style={{ fontWeight: '600' }}>₹0.00</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: '800', borderTop: '1px solid #cbd5e1', paddingTop: '4px', marginBottom: '4px', color: '#0f172a' }}>
              <span>Total Bill:</span>
              <span>₹{grossTotalBill.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: '#0054a6', marginBottom: '3px', fontWeight: '800' }}>
              <span>Total Amount to Pay:</span>
              <span>₹{grossTotalBill.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Payment Details & Authorized Signatory Section */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          padding: '12px',
          background: '#f8fafc',
          border: '1px solid #e2e8f0',
          borderRadius: '6px',
          marginBottom: '14px',
          alignItems: 'center'
        }}>
          {/* Left: Payment Info */}
          <div>
            <div style={{ fontSize: '0.7rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              PAYMENT DETAILS
            </div>
            <div style={{ fontSize: '0.78rem', marginTop: '3px', color: '#0f172a' }}>
              Gpay / PhonePe / Paytm: <strong style={{ color: '#0054a6' }}>{businessProfile.upi_phone || '7022754524'}</strong>
            </div>
            {businessProfile.upi_id && (
              <div style={{ fontSize: '0.78rem', marginTop: '2px' }}>
                UPI ID: <strong style={{ color: '#0054a6' }}>{businessProfile.upi_id}</strong>
              </div>
            )}
            {businessProfile.upi_qr && (
              <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  background: 'white',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <img
                    src={businessProfile.upi_qr}
                    alt="UPI QR Code"
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                </div>
                <div style={{ fontSize: '0.72rem', color: '#475569' }}>
                  <strong style={{ display: 'block', color: '#0f172a' }}>Scan to Pay</strong>
                  <span>Accepted: UPI • Cash • Bank</span>
                </div>
              </div>
            )}
            {!businessProfile.upi_qr && (
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '3px' }}>
                Accepted: UPI • Cash • Bank Transfer
              </div>
            )}
          </div>

          {/* Right: Authorized Signature */}
          <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
            {businessProfile.signature ? (
              <div style={{ height: '44px', marginBottom: '2px', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
                <img
                  src={businessProfile.signature}
                  alt="Signature"
                  style={{ maxHeight: '44px', maxWidth: '140px', objectFit: 'contain' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              </div>
            ) : (
              <div style={{ height: '24px' }}></div>
            )}
            <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '3px', minWidth: '150px', textAlign: 'center' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: '800', color: '#0f172a' }}>Authorized Signatory</div>
              <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{businessProfile.invoice_business_name || businessProfile.business_name || 'Nandini Milk Parlour'}</div>
            </div>
          </div>
        </div>

        {/* Bottom Customer-Friendly Quote */}
        <div style={{ textAlign: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontStyle: 'italic' }}>
            "Thank you for choosing Nandini Milk Parlour — Freshness delivered with care."
          </p>
        </div>
      </div>
    </div>
  );
}
