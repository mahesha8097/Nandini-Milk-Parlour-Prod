import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Sparkles,
  Search,
  X,
  ChevronDown,
  Building2,
  MapPin,
  Route as RouteIcon
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

  // Delivery Charge Calculation Rule Key: 'COMBINED_DAILY' (1L of two different milks = ₹3/day) or 'PER_PACKET' (₹2 per packet)
  const [deliveryRuleMode, setDeliveryRuleMode] = useState('COMBINED_DAILY');

  // Calendar Section Target Product: 'ALL' or specific product index string ('0', '1', ...)
  const [calendarTargetProduct, setCalendarTargetProduct] = useState('ALL');

  // Customer Search & Filter State
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
  const [routeFilter, setRouteFilter] = useState('ALL');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsCustomerDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Calendar Modal State
  const [calendarModalOpen, setCalendarModalOpen] = useState(false);
  const [activeItemIndex, setActiveItemIndex] = useState(null);
  const [tempSelectedDays, setTempSelectedDays] = useState([]);
  const [tempStartDate, setTempStartDate] = useState('');
  const [tempEndDate, setTempEndDate] = useState('');

  const [loading, setLoading] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [whatsappDirectUrl, setWhatsappDirectUrl] = useState('');
  const [whatsappModalOpen, setWhatsappModalOpen] = useState(false);
  const [copiedBlob, setCopiedBlob] = useState(null);

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

  const availableRoutes = useMemo(() => {
    const set = new Set();
    customers.forEach(c => {
      if (c.route && c.route.trim()) set.add(c.route.trim());
    });
    return Array.from(set).sort();
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.toLowerCase().trim();
    return customers.filter(c => {
      if (routeFilter !== 'ALL' && c.route !== routeFilter) return false;
      if (!q) return true;
      return (
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.flat_no && c.flat_no.toLowerCase().includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.zone_name && c.zone_name.toLowerCase().includes(q)) ||
        (c.route && c.route.toLowerCase().includes(q))
      );
    });
  }, [customers, customerSearchQuery, routeFilter]);

  const calculateSubscriptionDaysForMonth = (sub, yearMonth = selectedMonth) => {
    const [year, month] = yearMonth.split('-').map(Number);
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    const monthStart = `${yearMonth}-01`;
    const monthEnd = `${yearMonth}-${pad(totalDaysInMonth)}`;

    const startDate = sub?.start_date ? sub.start_date.substring(0, 10) : null;
    const endDate = sub?.end_date && sub.end_date.trim() !== '' ? sub.end_date.substring(0, 10) : null;

    // 1. Subscription starts after the end of this month -> 0 days
    if (startDate && startDate > monthEnd) {
      return {
        days: 0,
        startDate: null,
        endDate: null,
        selectedDays: []
      };
    }

    // 2. Subscription ended before this month starts -> 0 days
    if (endDate && endDate < monthStart) {
      return {
        days: 0,
        startDate: null,
        endDate: null,
        selectedDays: []
      };
    }

    // 3. Determine active range in this month
    let startDay = 1;
    if (startDate && startDate > monthStart) {
      startDay = parseInt(startDate.split('-')[2], 10);
    }

    let endDay = totalDaysInMonth;
    if (endDate && endDate < monthEnd) {
      endDay = parseInt(endDate.split('-')[2], 10);
    }

    const selectedDays = [];
    if (startDay <= endDay && startDay <= totalDaysInMonth && endDay >= 1) {
      const actualStart = Math.max(1, startDay);
      const actualEnd = Math.min(totalDaysInMonth, endDay);
      for (let d = actualStart; d <= actualEnd; d++) {
        selectedDays.push(d);
      }
    }

    return {
      days: selectedDays.length,
      startDate: selectedDays.length > 0 ? `${yearMonth}-${pad(selectedDays[0])}` : null,
      endDate: selectedDays.length > 0 ? `${yearMonth}-${pad(selectedDays[selectedDays.length - 1])}` : null,
      selectedDays
    };
  };

  const calculateDefaultDaysForCustomer = (cust, yearMonth = selectedMonth) => {
    if (cust && cust.subscriptions && cust.subscriptions.length > 0) {
      return calculateSubscriptionDaysForMonth(cust.subscriptions[0], yearMonth);
    }
    const [year, month] = yearMonth.split('-').map(Number);
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    const allDays = [];
    for (let d = 1; d <= totalDaysInMonth; d++) allDays.push(d);
    return {
      days: totalDaysInMonth,
      startDate: `${yearMonth}-01`,
      endDate: `${yearMonth}-${pad(totalDaysInMonth)}`,
      selectedDays: allDays
    };
  };

  const handleSelectCustomer = (custId, custList = customers, prodList = products, targetMonth = selectedMonth) => {
    setSelectedCustomerId(custId);
    const cust = custList.find(c => String(c.id) === String(custId));
    if (!cust) return;

    const defaultDayInfo = calculateDefaultDaysForCustomer(cust, targetMonth);

    if (cust.subscriptions && cust.subscriptions.length > 0) {
      const mapped = cust.subscriptions.map(s => {
        const prod = prodList.find(p => p.id === s.product_id) || {};
        const itemDayInfo = calculateSubscriptionDaysForMonth(s, targetMonth);

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
    if (cust && cust.subscriptions && cust.subscriptions.length > 0) {
      const mapped = cust.subscriptions.map(s => {
        const prod = products.find(p => p.id === s.product_id) || {};
        const itemDayInfo = calculateSubscriptionDaysForMonth(s, newMonth);
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
    } else {
      const dayInfo = calculateDefaultDaysForCustomer(cust, newMonth);
      setItems(prev => prev.map(it => ({
        ...it,
        days: dayInfo.days,
        startDate: dayInfo.startDate,
        endDate: dayInfo.endDate,
        selectedDays: dayInfo.selectedDays
      })));
    }
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
    const parsed = parseInt(daysVal, 10);
    const num = isNaN(parsed) ? 0 : Math.max(0, Math.min(maxDays, parsed));
    const pad = (n) => String(n).padStart(2, '0');

    // Default to first N days
    const newSelectedDays = [];
    for (let d = 1; d <= num; d++) newSelectedDays.push(d);

    setItems(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      return {
        ...item,
        days: num,
        startDate: num > 0 ? `${selectedMonth}-01` : null,
        endDate: num > 0 ? `${selectedMonth}-${pad(num)}` : null,
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
    const itemDays = item.days !== undefined ? item.days : defaultMonthDays;
    setTempSelectedDays([...(item.selectedDays || getDaysArray(itemDays))]);
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
    const count = tempSelectedDays.length;
    const sortedDays = [...tempSelectedDays].sort((a, b) => a - b);
    const pad = (n) => String(n).padStart(2, '0');
    const startStr = sortedDays.length > 0 ? `${selectedMonth}-${pad(sortedDays[0])}` : null;
    const endStr = sortedDays.length > 0 ? `${selectedMonth}-${pad(sortedDays[sortedDays.length - 1])}` : null;

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
  // EXACT BUSINESS RULES DELIVERY CHARGE & ADVANCE CALCULATION
  // -------------------------------------------------------------
  const selectedCustomer = customers.find(c => String(c.id) === String(selectedCustomerId)) || null;
  const isBulkHotel = selectedCustomer?.customer_category === 'BULK_HOTEL';

  // Day-by-day delivery and milk calculation across the month
  // Correctly handles customers taking multiple different milks on the same day:
  // - Combined daily volume (e.g. 500ml Shubham + 500ml Special = 1.0L total milk) -> ₹3.00/day delivery charge!
  // - Also supports per-packet separate mode (₹2 each packet) via the selector key.
  // - Bulk / Hotel customers -> ₹0 delivery charges
  // - For days with no milk -> ₹0 billed (No Milk Required)
  const dailyBreakdown = useMemo(() => {
    const daysInMonth = defaultMonthDays;
    const days = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const activeForDay = items
        .map((it, idx) => ({ ...it, originalIndex: idx }))
        .filter(it => (it.selectedDays || []).includes(d));

      if (activeForDay.length === 0) {
        days.push({
          day: d,
          hasMilk: false,
          activeItems: [],
          totalLitres: 0,
          milkCost: 0,
          deliveryCharge: 0,
          dayTotal: 0,
          itemCharges: {}
        });
        continue;
      }

      let milkCost = 0;
      let totalLitres = 0;
      const milkItems = [];
      const otherItems = [];

      activeForDay.forEach(it => {
        const qty = Math.max(0, parseInt(it.quantity, 10) || 0);
        const unitPrice = parseFloat(it.unitPrice) || 0;
        milkCost += unitPrice * qty;

        const chargeType = it.deliveryChargeType || it.delivery_charge_type;
        const isMilkCat = Boolean(it.category && it.category.trim().toLowerCase() === 'milk');
        const isMilkRule = chargeType === 'MILK_RULE' || (!chargeType && isMilkCat);

        let vol = parseFloat(it.unitVolumeLitres) || 0;
        if (!vol || vol <= 0) {
          if (it.variantLabel && it.variantLabel.toLowerCase().includes('500')) vol = 0.5;
          else if (it.variantLabel && it.variantLabel.toLowerCase().includes('1')) vol = 1.0;
          else vol = 0.5;
        }

        if (isMilkRule) {
          milkItems.push({ ...it, qty, vol, itemLitres: vol * qty });
          totalLitres += vol * qty;
        } else {
          otherItems.push({ ...it, qty, vol, chargeType });
        }
      });

      let dayDeliveryCharge = 0;
      const itemCharges = {};

      if (isBulkHotel) {
        dayDeliveryCharge = 0;
        activeForDay.forEach(it => { itemCharges[it.originalIndex] = 0; });
      } else {
        if (milkItems.length > 0) {
          if (deliveryRuleMode === 'PER_PACKET') {
            // Per packet separate rule (₹2 per 500ml packet)
            milkItems.forEach(m => {
              const charge = (m.vol <= 0.5 ? 2.0 : (m.vol * 3.0)) * m.qty;
              itemCharges[m.originalIndex] = parseFloat(charge.toFixed(2));
              dayDeliveryCharge += charge;
            });
          } else {
            // Combined daily volume rule (e.g. 1L across different milks = ₹3/day)
            let milkGroupCharge = 0;
            if (totalLitres <= 0) {
              milkGroupCharge = 0;
            } else if (totalLitres <= 0.5) {
              milkGroupCharge = 2.0;
            } else {
              milkGroupCharge = parseFloat((totalLitres * 3.0).toFixed(2));
            }
            dayDeliveryCharge += milkGroupCharge;

            // Distribute group charge proportionally across milk items
            let remainingMilkCharge = milkGroupCharge;
            milkItems.forEach((m, idx) => {
              if (idx === milkItems.length - 1) {
                itemCharges[m.originalIndex] = parseFloat(remainingMilkCharge.toFixed(2));
              } else {
                const share = totalLitres > 0
                  ? parseFloat(((m.itemLitres / totalLitres) * milkGroupCharge).toFixed(2))
                  : 0;
                itemCharges[m.originalIndex] = share;
                remainingMilkCharge -= share;
              }
            });
          }
        }

        // Other products
        otherItems.forEach(o => {
          let charge = 0;
          if (o.chargeType === 'FIXED_PER_UNIT') {
            const fixedPerUnit = parseFloat(o.fixedDeliveryCharge !== undefined ? o.fixedDeliveryCharge : o.fixed_delivery_charge) || 0;
            charge = parseFloat((fixedPerUnit * o.qty).toFixed(2));
          } else {
            charge = 0;
          }
          itemCharges[o.originalIndex] = charge;
          dayDeliveryCharge += charge;
        });
      }

      dayDeliveryCharge = parseFloat(dayDeliveryCharge.toFixed(2));
      milkCost = parseFloat(milkCost.toFixed(2));

      days.push({
        day: d,
        hasMilk: true,
        activeItems: activeForDay,
        totalLitres,
        milkCost,
        deliveryCharge: dayDeliveryCharge,
        dayTotal: parseFloat((milkCost + dayDeliveryCharge).toFixed(2)),
        itemCharges
      });
    }

    return days;
  }, [items, defaultMonthDays, isBulkHotel, deliveryRuleMode]);

  const calculatedItems = useMemo(() => {
    return items.map((item, idx) => {
      const selectedDays = item.selectedDays || [];
      const itemDays = selectedDays.length;
      const qty = Math.max(0, parseInt(item.quantity, 10) || 0);
      const totalQty = qty * itemDays;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      const milkSubtotal = parseFloat((unitPrice * totalQty).toFixed(2));

      let deliveryChargeTotal = 0;
      dailyBreakdown.forEach(dayInfo => {
        if (dayInfo.hasMilk && dayInfo.itemCharges[idx] !== undefined) {
          deliveryChargeTotal += dayInfo.itemCharges[idx];
        }
      });
      deliveryChargeTotal = parseFloat(deliveryChargeTotal.toFixed(2));
      const lineTotal = parseFloat((milkSubtotal + deliveryChargeTotal).toFixed(2));
      const effectiveUnitPrice = totalQty > 0 ? parseFloat((lineTotal / totalQty).toFixed(2)) : unitPrice;
      const dailyDeliveryCharge = itemDays > 0 ? parseFloat((deliveryChargeTotal / itemDays).toFixed(2)) : 0;

      return {
        ...item,
        itemDays,
        totalQty,
        milkSubtotal,
        dailyDeliveryCharge,
        deliveryChargeTotal,
        lineTotal,
        effectiveUnitPrice
      };
    });
  }, [items, dailyBreakdown]);

  const totalMilkSubtotal = calculatedItems.reduce((acc, it) => acc + it.milkSubtotal, 0);
  const totalDeliveryCharges = calculatedItems.reduce((acc, it) => acc + it.deliveryChargeTotal, 0);
  const grossTotalBill = parseFloat((totalMilkSubtotal + totalDeliveryCharges).toFixed(2));

  // Calendar summary counts
  const scheduledMilkDaysCount = useMemo(() => {
    return dailyBreakdown.filter(d => d.hasMilk).length;
  }, [dailyBreakdown]);

  const noMilkDaysCount = Math.max(0, defaultMonthDays - scheduledMilkDaysCount);

  const monthDisplayTitle = useMemo(() => {
    if (!selectedMonth) return '';
    const [year, month] = selectedMonth.split('-').map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  const [yearNum, monthNum] = (selectedMonth || '2026-10').split('-').map(Number);
  const firstDayOfMonthOffset = new Date(yearNum, monthNum - 1, 1).getDay();

  // Handler to toggle an individual day on the calendar (Milk Taken <-> No Milk Required)
  const handleToggleCalendarDay = (dayNum) => {
    const pad = (n) => String(n).padStart(2, '0');
    setItems(prevItems => {
      const targetIndices = calendarTargetProduct === 'ALL'
        ? prevItems.map((_, i) => i)
        : [parseInt(calendarTargetProduct, 10)];

      const isCurrentlyActive = targetIndices.some(idx =>
        (prevItems[idx]?.selectedDays || []).includes(dayNum)
      );

      return prevItems.map((item, idx) => {
        if (!targetIndices.includes(idx)) return item;
        const currentDays = item.selectedDays || [];
        let newDays;
        if (isCurrentlyActive) {
          newDays = currentDays.filter(d => d !== dayNum);
        } else {
          newDays = [...currentDays, dayNum].sort((a, b) => a - b);
        }
        return {
          ...item,
          days: newDays.length,
          startDate: newDays.length > 0 ? `${selectedMonth}-${pad(newDays[0])}` : null,
          endDate: newDays.length > 0 ? `${selectedMonth}-${pad(newDays[newDays.length - 1])}` : null,
          selectedDays: newDays
        };
      });
    });
  };

  // Handler for Calendar Presets
  const handleApplyCalendarPreset = (presetType) => {
    const pad = (n) => String(n).padStart(2, '0');
    const totalDays = defaultMonthDays;
    let targetDays = [];

    if (presetType === 'FULL') {
      for (let d = 1; d <= totalDays; d++) targetDays.push(d);
    } else if (presetType === 'ODD') {
      for (let d = 1; d <= totalDays; d += 2) targetDays.push(d);
    } else if (presetType === 'EVEN') {
      for (let d = 2; d <= totalDays; d += 2) targetDays.push(d);
    } else if (presetType === 'WEEKDAYS') {
      const [y, m] = selectedMonth.split('-').map(Number);
      for (let d = 1; d <= totalDays; d++) {
        const dayOfWeek = new Date(y, m - 1, d).getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) targetDays.push(d);
      }
    } else if (presetType === 'CLEAR') {
      targetDays = [];
    }

    setItems(prevItems => {
      const targetIndices = calendarTargetProduct === 'ALL'
        ? prevItems.map((_, i) => i)
        : [parseInt(calendarTargetProduct, 10)];

      return prevItems.map((item, idx) => {
        if (!targetIndices.includes(idx)) return item;
        return {
          ...item,
          days: targetDays.length,
          startDate: targetDays.length > 0 ? `${selectedMonth}-${pad(targetDays[0])}` : null,
          endDate: targetDays.length > 0 ? `${selectedMonth}-${pad(targetDays[targetDays.length - 1])}` : null,
          selectedDays: [...targetDays]
        };
      });
    });
  };

  // Advance adjustment for Prepaid / Advance Balance customers
  const customerAdvance = Number(selectedCustomer?.advance_balance || 0);
  const customerPending = Number(selectedCustomer?.pending_balance || 0);
  const isPrepaid = selectedCustomer?.billing_type === 'PREPAID';
  const advanceAdjusted = (isPrepaid || customerAdvance > 0)
    ? parseFloat(Math.min(customerAdvance, grossTotalBill).toFixed(2))
    : 0;
  const netPayable = parseFloat(Math.max(0, grossTotalBill - advanceAdjusted).toFixed(2));
  const remainingAdvance = parseFloat(Math.max(0, customerAdvance - advanceAdjusted).toFixed(2));


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

    let cleanPhone = String(phone).replace(/[^0-9]/g, '').replace(/^0+/, '');
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }
    const phoneFormatted = cleanPhone;

    if (!phoneFormatted || phoneFormatted.length < 10) {
      alert(`Customer phone number (${phone}) is invalid.`);
      return;
    }

    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;

    // Synchronously pre-open blank tab within the user click gesture to avoid browser popup blockers on desktop
    let whatsappTab = null;
    if (!isMobile) {
      try {
        whatsappTab = window.open('about:blank', '_blank');
        if (whatsappTab) {
          whatsappTab.document.write(`
            <!DOCTYPE html>
            <html>
              <head><title>Opening WhatsApp...</title></head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 90vh; margin: 0; background: #f8fafc; color: #1e293b;">
                <div style="text-align: center; padding: 28px; max-width: 420px; background: white; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
                  <div style="font-size: 36px; margin-bottom: 12px;">⏳</div>
                  <h3 style="margin: 0 0 8px; font-size: 18px; color: #0f172a;">Connecting to WhatsApp...</h3>
                  <p style="margin: 0; color: #64748b; font-size: 14px; line-height: 1.5;">Preparing invoice picture and redirecting to customer chat (${phoneFormatted}). Please hold on...</p>
                </div>
              </body>
            </html>
          `);
        }
      } catch (e) {
        console.warn('Pre-open tab note:', e);
      }
    }

    const invoiceElement = document.getElementById('printable-invoice-content');

    const hostOrigin = (window.location.origin && !window.location.origin.includes('localhost'))
      ? window.location.origin
      : 'https://nandini-milk-parlour-prod.vercel.app';
    const statementUrl = `${hostOrigin}/#orders?c=${selectedCustomer.id}&m=${selectedMonth}`;

    const itemsSummary = calculatedItems.map(it =>
      `• ${it.productName} (${it.variantLabel}) × ${it.quantity}/day for ${it.itemDays} days (${it.totalQty} total @ ₹${it.effectiveUnitPrice.toFixed(2)}) = ₹${it.lineTotal.toFixed(2)}`
    ).join('\n');

    let baseMsg = `*NANDINI MILK PARLOUR — ADVANCE MONTHLY BILL*\n`;
    baseMsg += `*Invoice No:* ${invoiceNumber}\n`;
    baseMsg += `*Month:* ${selectedMonth}\n`;
    baseMsg += `*Customer:* ${selectedCustomer.name}\n`;
    baseMsg += `*Schedule:* ${scheduledMilkDaysCount} Milk Days Scheduled`;
    if (noMilkDaysCount > 0) {
      baseMsg += ` (${noMilkDaysCount} Days: No Milk Required)`;
    }
    baseMsg += `\n\n*Products & Schedule:* \n${itemsSummary}\n\n`;
    if (advanceAdjusted > 0) {
      baseMsg += `*Total Bill:* ₹${grossTotalBill.toFixed(2)}\n`;
      baseMsg += `*Deducted from Advance:* ₹${advanceAdjusted.toFixed(2)}\n`;
      baseMsg += `*NET AMOUNT TO PAY:* ₹${netPayable.toFixed(2)}${netPayable === 0 ? ' (Paid from Advance Deposit ✓)' : ''}\n`;
      if (remainingAdvance > 0) {
        baseMsg += `*Remaining Advance Balance:* ₹${remainingAdvance.toFixed(2)}\n`;
      }
      baseMsg += `\n`;
    } else {
      baseMsg += `*TOTAL AMOUNT TO PAY:* ₹${grossTotalBill.toFixed(2)}\n\n`;
    }
    baseMsg += `*Payment Details:*\n`;
    baseMsg += `*Gpay / PhonePe / Paytm:* ${businessProfile.upi_phone || '7022754524'}\n`;
    if (businessProfile.upi_id) {
      baseMsg += `*UPI ID:* ${businessProfile.upi_id}\n`;
    }
    baseMsg += `\n📱 *View Daily Deliveries & Online Invoice:* \n${statementUrl}\n`;

    if (!invoiceElement) {
      const fallbackUrl = `https://api.whatsapp.com/send?phone=${phoneFormatted}&text=${encodeURIComponent(baseMsg + '\nThank you for choosing Nandini Milk Parlour! 🙏')}`;
      if (whatsappTab && !whatsappTab.closed) {
        whatsappTab.location.href = fallbackUrl;
      } else {
        window.open(fallbackUrl, '_blank') || (window.location.href = fallbackUrl);
      }
      return;
    }

    let prevWidth = '';
    let prevMinWidth = '';
    let prevMaxWidth = '';

    try {
      setCapturing(true);

      const scrollParent = invoiceElement.closest('.invoice-scroll-container') || invoiceElement.closest('.invoice-preview-wrapper');
      const prevScrollLeft = scrollParent ? scrollParent.scrollLeft : 0;
      if (scrollParent) scrollParent.scrollLeft = 0;

      prevWidth = invoiceElement.style.width;
      prevMinWidth = invoiceElement.style.minWidth;
      prevMaxWidth = invoiceElement.style.maxWidth;
      invoiceElement.style.width = '800px';
      invoiceElement.style.minWidth = '800px';
      invoiceElement.style.maxWidth = '800px';

      const canvas = await html2canvas(invoiceElement, {
        scale: 2,
        width: 800,
        windowWidth: 1200,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const el = clonedDoc.getElementById('printable-invoice-content');
          if (el) {
            el.style.width = '800px';
            el.style.minWidth = '800px';
            el.style.maxWidth = '800px';
            el.style.boxSizing = 'border-box';
            el.style.margin = '0 auto';
            el.style.transform = 'none';
          }
          const sc = clonedDoc.querySelector('.invoice-scroll-container') || clonedDoc.querySelector('.invoice-preview-wrapper');
          if (sc) {
            sc.scrollLeft = 0;
            sc.style.overflow = 'visible';
          }
        }
      });

      invoiceElement.style.width = prevWidth;
      invoiceElement.style.minWidth = prevMinWidth;
      invoiceElement.style.maxWidth = prevMaxWidth;
      if (scrollParent) scrollParent.scrollLeft = prevScrollLeft;

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      const fileName = `Invoice_${invoiceNumber}.png`;
      const file = blob ? new File([blob], fileName, { type: 'image/png' }) : null;

      // Upload picture to cloud storage for a direct high-resolution picture link in WhatsApp
      let cloudImageUrl = null;
      if (blob) {
        try {
          const formData = new FormData();
          formData.append('invoice', blob, fileName);
          const uploadRes = await api.post('/bills/upload-invoice-image', formData);
          if (uploadRes && uploadRes.fileUrl) {
            cloudImageUrl = uploadRes.fileUrl.startsWith('http')
              ? uploadRes.fileUrl
              : `${hostOrigin}${uploadRes.fileUrl}`;
          }
        } catch (uploadErr) {
          console.warn('Invoice image cloud upload note:', uploadErr);
        }
      }

      let fullMsg = baseMsg;
      if (cloudImageUrl) {
        fullMsg += `\n📸 *View / Download Invoice Picture:* \n${cloudImageUrl}\n`;
      }
      fullMsg += `\nThank you for choosing Nandini Milk Parlour! 🙏`;

      const whatsappUrl = `https://api.whatsapp.com/send?phone=${phoneFormatted}&text=${encodeURIComponent(fullMsg)}`;
      setWhatsappDirectUrl(whatsappUrl);

      // 1. Mobile Flow: Native Web Share API with File
      if (isMobile) {
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: `Invoice ${invoiceNumber}`,
              text: `Nandini Milk Parlour — Invoice ${invoiceNumber}\nCustomer: ${selectedCustomer.name}\nNet Payable: ₹${netPayable.toFixed(2)}${cloudImageUrl ? '\n\n📸 Invoice Picture: ' + cloudImageUrl : ''}`,
              files: [file]
            });
            return;
          } catch (shareErr) {
            if (shareErr.name !== 'AbortError') {
              console.log('Native share fallback:', shareErr);
            } else {
              return;
            }
          }
        }
        window.location.href = whatsappUrl;
        return;
      }

      // 2. Desktop Flow:
      // Copy image to clipboard for instantaneous Ctrl+V into WhatsApp Web chat
      let clipboardCopied = false;
      if (blob) {
        setCopiedBlob(blob);
        try {
          if (navigator.clipboard && navigator.clipboard.write) {
            await navigator.clipboard.write([
              new ClipboardItem({ 'image/png': blob })
            ]);
            clipboardCopied = true;
          }
        } catch (clipErr) {
          console.log('Clipboard copy note:', clipErr);
        }
      }

      // Redirect pre-opened WhatsApp window
      let tabOpened = false;
      if (whatsappTab && !whatsappTab.closed) {
        try {
          whatsappTab.location.href = whatsappUrl;
          whatsappTab.focus();
          tabOpened = true;
        } catch (e) {
          console.warn('Redirect tab failed:', e);
        }
      }

      if (!tabOpened) {
        try {
          const directWin = window.open(whatsappUrl, '_blank');
          if (directWin && !directWin.closed) {
            tabOpened = true;
          }
        } catch (e) {
          console.warn('Direct window.open failed:', e);
        }
      }

      // Show Desktop WhatsApp guidance modal & toast (NO automatic file download!)
      setWhatsappModalOpen(true);
      setToastMsg(
        clipboardCopied
          ? '📸 Invoice picture copied to clipboard & WhatsApp opened! Press Ctrl + V in chat to paste the picture.'
          : '💬 Opening WhatsApp customer chat with invoice link & details.'
      );
      setTimeout(() => setToastMsg(''), 10000);
    } catch (err) {
      if (invoiceElement) {
        invoiceElement.style.width = prevWidth;
        invoiceElement.style.minWidth = prevMinWidth;
        invoiceElement.style.maxWidth = prevMaxWidth;
      }
      console.error('Invoice capture error:', err);
      const fallbackUrl = `https://api.whatsapp.com/send?phone=${phoneFormatted}&text=${encodeURIComponent(baseMsg + '\nThank you for choosing Nandini Milk Parlour! 🙏')}`;
      if (whatsappTab && !whatsappTab.closed) {
        whatsappTab.location.href = fallbackUrl;
      } else {
        window.open(fallbackUrl, '_blank') || (window.location.href = fallbackUrl);
      }
      setToastMsg('Redirecting to WhatsApp with invoice details.');
      setTimeout(() => setToastMsg(''), 6000);
    } finally {
      setCapturing(false);
    }
  };

  const handleDownloadImage = async () => {
    const invoiceElement = document.getElementById('printable-invoice-content');
    if (!invoiceElement) return;

    let prevWidth = '';
    let prevMinWidth = '';
    let prevMaxWidth = '';

    try {
      setCapturing(true);

      const scrollParent = invoiceElement.closest('.invoice-scroll-container') || invoiceElement.closest('.invoice-preview-wrapper');
      const prevScrollLeft = scrollParent ? scrollParent.scrollLeft : 0;
      if (scrollParent) scrollParent.scrollLeft = 0;

      // Temporarily lock element to desktop standard 800px width for capture
      prevWidth = invoiceElement.style.width;
      prevMinWidth = invoiceElement.style.minWidth;
      prevMaxWidth = invoiceElement.style.maxWidth;
      invoiceElement.style.width = '800px';
      invoiceElement.style.minWidth = '800px';
      invoiceElement.style.maxWidth = '800px';

      const canvas = await html2canvas(invoiceElement, {
        scale: 2,
        width: 800,
        windowWidth: 1200,
        scrollX: 0,
        scrollY: 0,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const el = clonedDoc.getElementById('printable-invoice-content');
          if (el) {
            el.style.width = '800px';
            el.style.minWidth = '800px';
            el.style.maxWidth = '800px';
            el.style.boxSizing = 'border-box';
            el.style.margin = '0 auto';
            el.style.transform = 'none';
          }
          const sc = clonedDoc.querySelector('.invoice-scroll-container') || clonedDoc.querySelector('.invoice-preview-wrapper');
          if (sc) {
            sc.scrollLeft = 0;
            sc.style.overflow = 'visible';
          }
        }
      });

      // Restore on-screen responsive layout immediately
      invoiceElement.style.width = prevWidth;
      invoiceElement.style.minWidth = prevMinWidth;
      invoiceElement.style.maxWidth = prevMaxWidth;
      if (scrollParent) scrollParent.scrollLeft = prevScrollLeft;

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
      if (invoiceElement) {
        invoiceElement.style.width = prevWidth;
        invoiceElement.style.minWidth = prevMinWidth;
        invoiceElement.style.maxWidth = prevMaxWidth;
      }
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
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 1.6fr) minmax(180px, 1fr) minmax(120px, 0.8fr) auto', gap: '14px', alignItems: 'flex-start' }}>
          {/* Searchable Customer Selector */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '800', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <User size={15} color="#2563eb" /> Select Customer:
              </span>
              {selectedCustomer && (
                <span style={{ fontSize: '0.72rem', color: '#16a34a', fontWeight: '700' }}>
                  ✓ {selectedCustomer.name}
                </span>
              )}
            </label>

            {/* Search Input + Route Filter */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={15} color="#94a3b8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  className="form-input"
                  placeholder="Search name, phone, flat, route..."
                  value={customerSearchQuery}
                  onChange={(e) => {
                    setCustomerSearchQuery(e.target.value);
                    setIsCustomerDropdownOpen(true);
                  }}
                  onFocus={() => setIsCustomerDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredCustomers.length > 0) {
                        handleSelectCustomer(filteredCustomers[0].id);
                        setIsCustomerDropdownOpen(false);
                        setCustomerSearchQuery('');
                      }
                    } else if (e.key === 'Escape') {
                      setIsCustomerDropdownOpen(false);
                    }
                  }}
                  style={{ paddingLeft: '32px', fontSize: '0.85rem', fontWeight: '600' }}
                />
                {customerSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setCustomerSearchQuery('')}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {availableRoutes.length > 0 && (
                <select
                  className="form-select"
                  value={routeFilter}
                  onChange={(e) => setRouteFilter(e.target.value)}
                  style={{ width: 'auto', fontSize: '0.8rem', fontWeight: '700', padding: '6px 10px', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                  title="Filter by route"
                >
                  <option value="ALL">All Routes ({availableRoutes.length})</option>
                  {availableRoutes.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Dropdown Results List */}
            {isCustomerDropdownOpen && (
              <div style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 1000,
                background: 'var(--bg-card)',
                borderRadius: '10px',
                border: '1.5px solid var(--border-color)',
                boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
                maxHeight: '320px',
                overflowY: 'auto',
                marginTop: '4px'
              }}>
                <div style={{ padding: '8px 12px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>Found {filteredCustomers.length} of {customers.length} customers</span>
                  <button
                    type="button"
                    onClick={() => setIsCustomerDropdownOpen(false)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: '800', fontSize: '0.75rem' }}
                  >
                    Close ✕
                  </button>
                </div>

                {filteredCustomers.length === 0 ? (
                  <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    No customers found matching "{customerSearchQuery}"
                  </div>
                ) : (
                  filteredCustomers.map(c => {
                    const isSelected = String(c.id) === String(selectedCustomerId);
                    return (
                      <div
                        key={c.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleSelectCustomer(c.id);
                          setIsCustomerDropdownOpen(false);
                          setCustomerSearchQuery('');
                        }}
                        onClick={(e) => {
                          e.preventDefault();
                          handleSelectCustomer(c.id);
                          setIsCustomerDropdownOpen(false);
                          setCustomerSearchQuery('');
                        }}
                        style={{
                          padding: '10px 14px',
                          borderBottom: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          userSelect: 'none',
                          background: isSelected ? 'var(--primary-light)' : 'var(--bg-card)',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                          transition: 'background 0.1s'
                        }}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--bg-table-hover)'; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'var(--primary-light)' : 'var(--bg-card)'; }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {c.flat_no && (
                              <span style={{ background: '#2563eb', color: 'white', fontSize: '0.72rem', fontWeight: '900', padding: '1px 6px', borderRadius: '4px' }}>
                                Flat {c.flat_no}
                              </span>
                            )}
                            <span style={{ fontWeight: '800', fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                              {c.name}
                            </span>
                            {c.customer_category === 'BULK_HOTEL' && (
                              <span style={{ background: 'rgba(168, 85, 247, 0.2)', color: '#c084fc', fontSize: '0.7rem', fontWeight: '800', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(168, 85, 247, 0.4)' }}>
                                Bulk Hotel
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            📞 {c.phone || 'No phone'} • 📍 {c.zone_name || 'No Zone'} ({c.route || 'General'})
                          </div>
                        </div>

                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <span style={{
                            fontSize: '0.72rem',
                            fontWeight: '800',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: c.billing_type === 'PREPAID' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                            color: c.billing_type === 'PREPAID' ? '#34d399' : '#fbbf24',
                            border: `1px solid ${c.billing_type === 'PREPAID' ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`
                          }}>
                            {c.billing_type || 'POSTPAID'}
                          </span>
                          {isSelected && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: '900', marginTop: '2px' }}>
                              ✓ Selected
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Currently Selected Customer Info Badge */}
            {selectedCustomer && (
              <div style={{
                marginTop: '6px',
                padding: '6px 10px',
                background: 'var(--primary-light)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                color: 'var(--text-primary)'
              }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <strong style={{ color: 'var(--primary)' }}>{selectedCustomer.name}</strong>
                  {selectedCustomer.flat_no ? ` [Flat ${selectedCustomer.flat_no}]` : ''} • {selectedCustomer.phone || 'No phone'} • Route: {selectedCustomer.route || 'General'}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomerDropdownOpen(true);
                    setTimeout(() => {
                      if (searchInputRef.current) searchInputRef.current.focus();
                    }, 50);
                  }}
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', padding: '2px 8px', fontSize: '0.72rem', fontWeight: '700', cursor: 'pointer', flexShrink: 0 }}
                >
                  Change
                </button>
              </div>
            )}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Daily Milk Items (Configure Qty & Days / Calendar per Product):
            </span>
            {/* Delivery Charge Calculation Selector Key */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '4px 10px',
              flexWrap: 'wrap'
            }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '800', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Sparkles size={13} color="#0054a6" /> Delivery Charge Rule:
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', fontWeight: '700', cursor: 'pointer', color: deliveryRuleMode === 'COMBINED_DAILY' ? '#0054a6' : 'var(--text-secondary)' }} title="When customer takes multiple milk packets (e.g. 2 x 500ml of different milks = 1L), delivery charge is ₹3/day total">
                <input
                  type="radio"
                  name="deliveryRuleMode"
                  value="COMBINED_DAILY"
                  checked={deliveryRuleMode === 'COMBINED_DAILY'}
                  onChange={() => setDeliveryRuleMode('COMBINED_DAILY')}
                />
                <span>Combined Litres (1L = ₹3/day) <strong style={{ color: '#16a34a' }}>✓ Default</strong></span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', fontWeight: '700', cursor: 'pointer', color: deliveryRuleMode === 'PER_PACKET' ? '#0054a6' : 'var(--text-secondary)' }} title="Charge ₹2 separately on every single packet">
                <input
                  type="radio"
                  name="deliveryRuleMode"
                  value="PER_PACKET"
                  checked={deliveryRuleMode === 'PER_PACKET'}
                  onChange={() => setDeliveryRuleMode('PER_PACKET')}
                />
                <span>Separate Per Packet (₹2 each)</span>
              </label>
            </div>
          </div>

          {items.map((item, idx) => {
            const calculated = calculatedItems[idx] || {};
            const itemDays = item.days !== undefined ? item.days : defaultMonthDays;

            return (
              <div
                key={idx}
                className="bill-gen-product-card"
                style={{
                  background: '#f8fafc',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                {/* Row 1: Product Selection & Delete Button */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                  <div style={{ flex: 1 }}>
                    <select
                      className="form-select"
                      style={{ fontSize: '0.85rem', fontWeight: '700', padding: '6px 10px', width: '100%' }}
                      value={item.productId}
                      onChange={(e) => handleItemProductChange(idx, e.target.value)}
                    >
                      {['Milk', 'Curd', 'Ghee', 'Sweets'].map(cat => {
                        const prodsInCat = products.filter(p => (p.category || '').toLowerCase() === cat.toLowerCase());
                        if (prodsInCat.length === 0) return null;
                        return (
                          <optgroup key={cat} label={`${cat} Products (${prodsInCat.length})`}>
                            {prodsInCat.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.variant_label}) — MRP ₹{p.selling_price}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                      {products.filter(p => !['milk', 'curd', 'ghee', 'sweets'].includes((p.category || '').toLowerCase())).length > 0 && (
                        <optgroup label="Other Products">
                          {products.filter(p => !['milk', 'curd', 'ghee', 'sweets'].includes((p.category || '').toLowerCase())).map(p => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.variant_label}) — MRP ₹{p.selling_price}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="btn btn-outline btn-sm"
                      style={{ padding: '6px 9px', color: '#dc2626', borderColor: '#fecaca', background: '#fef2f2', flexShrink: 0 }}
                      title="Remove Product Item"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {/* Row 2: Controls & Total Badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Qty:</span>
                      <input
                        type="number"
                        min="1"
                        className="form-input"
                        style={{ width: '52px', padding: '4px 6px', textAlign: 'center', fontWeight: '800' }}
                        value={item.quantity}
                        onChange={(e) => handleItemQtyChange(idx, e.target.value)}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#475569' }}>Days:</span>
                      <input
                        type="number"
                        min="0"
                        max={defaultMonthDays}
                        className="form-input"
                        style={{ width: '52px', padding: '4px 6px', textAlign: 'center', fontWeight: '800', color: '#0054a6', borderColor: '#93c5fd' }}
                        value={itemDays}
                        onChange={(e) => handleItemDaysDirectChange(idx, e.target.value)}
                        title={`Enter number of days (0-${defaultMonthDays}) for this product`}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() => handleOpenCalendarModal(idx)}
                      className="btn btn-outline btn-sm"
                      style={{
                        padding: '4px 8px',
                        fontSize: '0.75rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        background: '#eff6ff',
                        borderColor: '#93c5fd',
                        color: '#1d4ed8'
                      }}
                      title="Pick specific date range or toggle calendar days for this product"
                    >
                      <Calendar size={13} color="#1d4ed8" />
                      <span>{itemDays}d (Schedule)</span>
                    </button>
                  </div>

                  <div style={{
                    fontSize: '0.8rem',
                    fontWeight: '800',
                    background: '#e0f2fe',
                    color: '#0369a1',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    whiteSpace: 'nowrap'
                  }}>
                    Total: {item.quantity * itemDays} {item.variantLabel} (₹{(calculated.lineTotal || 0).toFixed(2)})
                  </div>
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

      {/* WhatsApp Guidance Modal */}
      <Modal
        isOpen={whatsappModalOpen}
        onClose={() => setWhatsappModalOpen(false)}
        title="💬 WhatsApp Invoice Sent & Ready"
        maxWidth="480px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: '#1e293b' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            background: '#ecfdf5',
            border: '1px solid #a7f3d0',
            padding: '12px 14px',
            borderRadius: '8px'
          }}>
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: '#10b981',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '800',
              flexShrink: 0
            }}>
              ✓
            </div>
            <div>
              <div style={{ fontWeight: '700', fontSize: '0.92rem', color: '#065f46' }}>
                Invoice Picture Copied & Link Attached!
              </div>
              <div style={{ fontSize: '0.8rem', color: '#047857' }}>
                WhatsApp customer chat has been opened in your browser.
              </div>
            </div>
          </div>

          <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.84rem', lineHeight: '1.5' }}>
            <div style={{ fontWeight: '700', color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              💡 How to send the picture directly in WhatsApp Web:
            </div>
            <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <li>Go to the opened <strong>WhatsApp Web tab</strong>.</li>
              <li>Click inside the message input box.</li>
              <li>Press <strong>Ctrl + V</strong> (or Right-Click → <em>Paste</em>).</li>
              <li>The high-definition invoice picture will attach immediately — hit Send! 🚀</li>
            </ol>
            <div style={{ marginTop: '10px', fontSize: '0.78rem', color: '#64748b' }}>
              ℹ️ A direct cloud view link is also included in the message so the customer can view the invoice online at any time.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
            {copiedBlob && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.write([
                      new ClipboardItem({ 'image/png': copiedBlob })
                    ]);
                    setToastMsg('📋 Invoice picture copied to clipboard again!');
                  } catch (e) {
                    alert('Could not copy to clipboard. Please use Download Picture.');
                  }
                }}
              >
                📋 Copy Picture Again
              </button>
            )}
            {whatsappDirectUrl && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                style={{ borderColor: '#22c55e', color: '#16a34a' }}
                onClick={() => window.open(whatsappDirectUrl, '_blank')}
              >
                💬 Open WhatsApp Chat
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ marginLeft: 'auto' }}
              onClick={() => setWhatsappModalOpen(false)}
            >
              Done
            </button>
          </div>
        </div>
      </Modal>

      {/* Toast Notification Banner */}
      {(toastMsg || whatsappDirectUrl) && (
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
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
          boxShadow: '0 2px 8px rgba(16,185,129,0.15)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={18} color="#059669" />
            <span>{toastMsg}</span>
          </div>
          {whatsappDirectUrl && (
            <a
              href={whatsappDirectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm"
              style={{
                background: '#25D366',
                color: 'white',
                borderColor: '#22c55e',
                fontWeight: '700',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                textDecoration: 'none'
              }}
              title="Direct link to open customer chat on WhatsApp"
            >
              <MessageCircle size={15} /> Open WhatsApp Chat
            </a>
          )}
        </div>
      )}

      {/* CALENDAR SECTION: Interactive Month Grid & Advance Calculation */}
      <div className="card" style={{ marginBottom: '20px', padding: '16px' }}>
        {/* Calendar Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CalendarDays size={20} color="#0054a6" />
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: '900', color: 'var(--text-primary)' }}>
                Monthly Delivery Schedule & Calendar — {monthDisplayTitle}
              </h3>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Click any day to toggle between <strong>Milk Taken</strong> and <strong>No Milk Required</strong>. Advance calculates based on active milk days.
            </p>
          </div>

          {/* Schedule Status Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              background: 'rgba(16, 185, 129, 0.12)',
              color: '#059669',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: '800',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              🥛 {scheduledMilkDaysCount} Milk Days Scheduled
            </span>
            <span style={{
              background: 'rgba(239, 68, 68, 0.08)',
              color: '#dc2626',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: '800',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              🚫 {noMilkDaysCount} Days: No Milk Required
            </span>
            <span style={{
              background: 'rgba(0, 84, 166, 0.1)',
              color: '#0054a6',
              border: '1px solid rgba(0, 84, 166, 0.25)',
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '0.75rem',
              fontWeight: '800',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              💰 Advance: ₹{grossTotalBill.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Advance Summary Highlight Banner */}
        <div style={{
          marginBottom: '14px',
          padding: '10px 14px',
          background: 'linear-gradient(135deg, rgba(0, 84, 166, 0.06) 0%, rgba(16, 185, 129, 0.08) 100%)',
          border: '1px solid #93c5fd',
          borderRadius: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CheckCircle2 size={16} color="#059669" />
            <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-primary)' }}>
              Advance calculated for <strong>{scheduledMilkDaysCount} active milk days</strong>. Remaining <strong>{noMilkDaysCount} days marked as "No Milk Required" (₹0)</strong>.
            </span>
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: '800', color: '#0054a6' }}>
            Milk Subtotal: ₹{totalMilkSubtotal.toFixed(2)} + Delivery: ₹{totalDeliveryCharges.toFixed(2)} = ₹{grossTotalBill.toFixed(2)}
          </div>
        </div>

        {/* Toolbar: Target Selector & Quick Presets */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '10px 12px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          marginBottom: '14px'
        }}>
          {/* Target Product Selector if multiple products */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: '800', color: 'var(--text-secondary)' }}>Schedule Days For:</span>
            <select
              className="form-select"
              value={calendarTargetProduct}
              onChange={(e) => setCalendarTargetProduct(e.target.value)}
              style={{ fontSize: '0.78rem', fontWeight: '700', padding: '4px 8px', width: 'auto' }}
            >
              <option value="ALL">All Products ({items.length})</option>
              {items.map((it, idx) => (
                <option key={idx} value={String(idx)}>
                  Only: {it.productName} ({it.variantLabel})
                </option>
              ))}
            </select>
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--text-secondary)' }}>Quick Presets:</span>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={() => handleApplyCalendarPreset('FULL')}
              title="Mark all days of the month as milk taken"
            >
              All Days ({defaultMonthDays}d)
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={() => handleApplyCalendarPreset('ODD')}
              title="Mark alternate days (1, 3, 5, 7...)"
            >
              Alternate (Odd)
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={() => handleApplyCalendarPreset('EVEN')}
              title="Mark alternate days (2, 4, 6, 8...)"
            >
              Alternate (Even)
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.72rem', padding: '3px 8px' }}
              onClick={() => handleApplyCalendarPreset('WEEKDAYS')}
              title="Mark Monday to Friday only"
            >
              Weekdays
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ fontSize: '0.72rem', padding: '3px 8px', color: '#dc2626', borderColor: '#fecaca' }}
              onClick={() => handleApplyCalendarPreset('CLEAR')}
              title="Mark all days as No Milk Required"
            >
              All No Milk
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '12px',
          overflowX: 'auto'
        }}>
          {/* Weekday Labels Header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(105px, 1fr))',
            gap: '6px',
            textAlign: 'center',
            marginBottom: '8px'
          }}>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((wd, i) => (
              <div key={wd} style={{
                fontSize: '0.75rem',
                fontWeight: '900',
                padding: '4px',
                color: i === 0 ? '#ef4444' : 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                {wd}
              </div>
            ))}
          </div>

          {/* Days Grid */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, minmax(105px, 1fr))',
            gap: '6px'
          }}>
            {/* Blank cells for start offset */}
            {Array.from({ length: firstDayOfMonthOffset }).map((_, i) => (
              <div key={`blank-${i}`} style={{ minHeight: '68px', opacity: 0.15 }} />
            ))}

            {/* Days of Month */}
            {dailyBreakdown.map((dayInfo) => {
              const d = dayInfo.day;
              const hasMilk = dayInfo.hasMilk;
              const isSunday = new Date(yearNum, monthNum - 1, d).getDay() === 0;

              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleToggleCalendarDay(d)}
                  title={hasMilk ? `Day ${d}: Milk Taken (₹${dayInfo.dayTotal}). Click to mark as No Milk Required.` : `Day ${d}: No Milk Required. Click to schedule Milk.`}
                  style={{
                    minHeight: '68px',
                    padding: '6px 8px',
                    borderRadius: '8px',
                    border: hasMilk
                      ? '1.5px solid #10b981'
                      : '1px dashed var(--border-color)',
                    background: hasMilk
                      ? 'rgba(16, 185, 129, 0.08)'
                      : 'var(--bg-card)',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    alignItems: 'stretch',
                    textAlign: 'left',
                    transition: 'all 0.15s ease',
                    boxShadow: hasMilk ? '0 1px 3px rgba(16, 185, 129, 0.15)' : 'none'
                  }}
                >
                  {/* Top row: Day number + status indicator */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <span style={{
                      fontSize: '0.85rem',
                      fontWeight: '900',
                      color: isSunday ? '#ef4444' : (hasMilk ? '#059669' : 'var(--text-muted)')
                    }}>
                      {d}
                    </span>
                    <span style={{
                      fontSize: '0.65rem',
                      fontWeight: '800',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: hasMilk ? '#10b981' : '#f1f5f9',
                      color: hasMilk ? '#ffffff' : '#64748b'
                    }}>
                      {hasMilk ? '🥛 MILK' : '🚫 OFF'}
                    </span>
                  </div>

                  {/* Middle: Milk info or No Milk Required */}
                  <div style={{ margin: '4px 0', fontSize: '0.7rem', lineHeight: '1.2' }}>
                    {hasMilk ? (
                      <div>
                        <div style={{ fontWeight: '700', color: '#047857' }}>
                          {dayInfo.totalLitres > 0 ? `${dayInfo.totalLitres}L Milk` : 'Milk Taken'}
                        </div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                          {isBulkHotel ? '₹0 Del' : (dayInfo.deliveryCharge > 0 ? `Del: ₹${dayInfo.deliveryCharge}` : 'Del: ₹0')}
                        </div>
                      </div>
                    ) : (
                      <div style={{ color: '#94a3b8', fontStyle: 'italic', fontSize: '0.68rem', fontWeight: '600' }}>
                        No milk required
                      </div>
                    )}
                  </div>

                  {/* Bottom: Cost */}
                  <div style={{ fontSize: '0.72rem', fontWeight: '800', textAlign: 'right', color: hasMilk ? '#0054a6' : 'var(--text-muted)' }}>
                    {hasMilk ? `₹${dayInfo.dayTotal.toFixed(0)}` : '₹0'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '10px', fontSize: '0.74rem', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'rgba(16, 185, 129, 0.2)', border: '1.5px solid #10b981' }}></span>
            <span><strong>Milk Taken</strong> (Included in advance bill calculation)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: 'var(--bg-card)', border: '1px dashed var(--border-color)' }}></span>
            <span><strong>No Milk Required</strong> (₹0 billed — excluded from advance bill)</span>
          </div>
          <div style={{ marginLeft: 'auto', fontStyle: 'italic', fontSize: '0.72rem' }}>
            💡 Click any day to toggle between Milk Taken and No Milk Required.
          </div>
        </div>
      </div>

      {/* ACTION BAR: Print & Share */}
      <div className="bill-gen-actions-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: '800', margin: 0, color: 'var(--text-primary)' }}>
          Invoice Preview — {invoiceNumber}
        </h2>
        <div className="btn-group" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={handleDownloadImage}
            className="btn btn-outline btn-sm"
            disabled={capturing || !selectedCustomer}
            style={{ fontWeight: '700', padding: '8px 12px' }}
            title="Download Invoice as PNG Picture"
          >
            <Download size={15} /> {capturing ? 'Processing...' : 'Download Picture'}
          </button>
          <button
            onClick={handleShareWhatsApp}
            className="btn btn-sm"
            style={{ background: '#25D366', color: 'white', borderColor: '#22c55e', fontWeight: '800', padding: '8px 12px' }}
            disabled={capturing || !selectedCustomer}
            title="Take Invoice Picture and send directly on WhatsApp"
          >
            <MessageCircle size={15} /> {capturing ? 'Capturing Picture...' : 'Send on WhatsApp'}
          </button>
          <button onClick={handlePrint} className="btn btn-primary btn-sm btn-print-action" style={{ fontWeight: '800', padding: '8px 12px' }} disabled={!selectedCustomer}>
            <Printer size={15} /> Print Bill (1 Sheet)
          </button>
        </div>
      </div>

      {/* EXACT IDENTICAL INVOICE SHEET (Matches BillInvoiceModal) */}
      <div className="invoice-preview-wrapper" style={{ width: '100%', marginBottom: '24px' }}>
        <div id="printable-invoice-content" className="invoice-sheet" style={{
          width: '100%',
          maxWidth: '850px',
          background: 'white',
          border: '1px solid #cbd5e1',
          borderRadius: 'var(--radius-md)',
          padding: '24px 28px',
          color: '#1e293b',
          fontSize: '0.813rem',
          lineHeight: '1.4',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          margin: '0 auto',
          boxSizing: 'border-box'
        }}>
          {/* Top Heading */}
          <div style={{ textAlign: 'center', marginBottom: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '6px' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: '800', letterSpacing: '0.12em', color: '#0054a6', textTransform: 'uppercase' }}>
              INVOICE
            </span>
          </div>

          {/* Business Header & Invoice Meta */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '12px', borderBottom: '2px solid #0054a6', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 auto', minWidth: 0, paddingRight: '16px' }}>
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

            <div style={{ textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
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
          <div className="invoice-table-wrapper" style={{ marginBottom: '14px', width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', minWidth: '540px' }}>
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

          {/* Schedule Note on Invoice if customer has off-days */}
          {noMilkDaysCount > 0 && (
            <div style={{
              marginTop: '-4px',
              marginBottom: '12px',
              padding: '6px 10px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              fontSize: '0.74rem',
              color: '#475569'
            }}>
              🗓️ <strong>Delivery Schedule:</strong> Milk scheduled on <strong>{scheduledMilkDaysCount} days</strong>. Remaining <strong>{noMilkDaysCount} days: No milk required (₹0)</strong>.
            </div>
          )}

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

              {advanceAdjusted > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#16a34a', marginBottom: '3px' }}>
                  <span>Deducted from Advance:</span>
                  <span style={{ fontWeight: '700' }}>-₹{advanceAdjusted.toFixed(2)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: netPayable > 0 ? '#0054a6' : '#15803d', marginBottom: '3px', fontWeight: '800' }}>
                <span>{netPayable === 0 ? 'Net Payable (Paid from Advance):' : 'Total Amount to Pay:'}</span>
                <span>₹{netPayable.toFixed(2)}</span>
              </div>

              {(remainingAdvance > 0 || customerPending > 0) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '800', borderTop: '1px solid #e2e8f0', paddingTop: '4px', marginTop: '3px', color: remainingAdvance > 0 ? '#15803d' : '#dc2626' }}>
                  <span>{remainingAdvance > 0 ? 'Remaining Advance Balance:' : 'Pending Due:'}</span>
                  <span>₹{(remainingAdvance > 0 ? remainingAdvance : customerPending).toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Advance Deduction Banner if applicable */}
          {advanceAdjusted > 0 && (
            <div style={{ marginBottom: '14px', padding: '10px 14px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '0.78rem', color: '#065f46', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
              <span><strong>Advance Settled:</strong> ₹{advanceAdjusted.toFixed(2)} for monthly milk has been deducted from advance deposit.</span>
              <span>Customer Remaining Advance: <strong>₹{remainingAdvance.toFixed(2)}</strong></span>
            </div>
          )}

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
    </div>
  );
}
