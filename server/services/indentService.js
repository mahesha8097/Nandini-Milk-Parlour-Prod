const db = require('../config/db');
const { getLocalDateString } = require('../utils/dateUtils');

/**
 * Standard Nandini products template based on KMF / Mother Dairy Indent Invoice.
 */
const DEFAULT_NANDINI_TEMPLATE = [
  {
    item_code: '[1]',
    product_name: 'TONED MILK 500ML',
    category: 'Milk',
    unit_label: '500 ml',
    purchase_price: 25.65,
    selling_price: 27.00
  },
  {
    item_code: '[2]',
    product_name: 'TONED MILK 1000ML',
    category: 'Milk',
    unit_label: '1 Litre',
    purchase_price: 51.30,
    selling_price: 54.00
  },
  {
    item_code: '[4]',
    product_name: 'SHUBAM 500ML',
    category: 'Milk',
    unit_label: '500 ml',
    purchase_price: 30.40,
    selling_price: 32.00
  },
  {
    item_code: '[83]',
    product_name: 'SHUBHAM 1000 ML',
    category: 'Milk',
    unit_label: '1 Litre',
    purchase_price: 60.80,
    selling_price: 64.00
  },
  {
    item_code: '[101]',
    product_name: 'SPECIAL MILK 500ML',
    category: 'Milk',
    unit_label: '500 ml',
    purchase_price: 30.40,
    selling_price: 32.00
  },
  {
    item_code: '[102]',
    product_name: 'SPECIAL MILK 1000ML',
    category: 'Milk',
    unit_label: '1 Litre',
    purchase_price: 60.80,
    selling_price: 64.00
  },
  {
    item_code: '[9]',
    product_name: 'HOMOGINISED COW MILK 500ML',
    category: 'Milk',
    unit_label: '500 ml',
    purchase_price: 27.55,
    selling_price: 29.00
  },
  {
    item_code: '[809]',
    product_name: 'HOMOGINISED COW MILK 140 ML',
    category: 'Milk',
    unit_label: '140 ml',
    purchase_price: 8.50,
    selling_price: 10.00
  },
  {
    item_code: '[11]',
    product_name: 'CURD 500GM',
    category: 'Curd',
    unit_label: '500 g',
    purchase_price: 31.19,
    selling_price: 34.00
  },
  {
    item_code: '[12]',
    product_name: 'CURD 1000GM',
    category: 'Curd',
    unit_label: '1 kg',
    purchase_price: 62.40,
    selling_price: 68.00
  },
  {
    item_code: '[13]',
    product_name: 'BUTTER MILK 200ML',
    category: 'Buttermilk',
    unit_label: '200 ml',
    purchase_price: 10.00,
    selling_price: 12.00
  }
];

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

class IndentService {
  /**
   * Return standard Nandini items template
   */
  getDefaultTemplate() {
    return DEFAULT_NANDINI_TEMPLATE.map(it => ({
      ...it,
      opening_stock: 0,
      inward_qty: 0,
      closing_stock: 0,
      damaged_qty: 0,
      missing_qty: 0,
      sold_qty: 0,
      margin_per_unit: Number((it.selling_price - it.purchase_price).toFixed(2))
    }));
  }

  /**
   * Fetch an indent for a specific date with all its line items
   */
  async getIndentByDate(date, agentId = 1) {
    const indentDate = date || getLocalDateString();

    const indentQuery = `
      SELECT * FROM daily_indents
      WHERE agent_id = ? AND indent_date = ?
    `;
    const indent = await db.prepare(indentQuery).get(agentId, indentDate);

    if (!indent) {
      // Check previous day for any leftover closing stock
      const prevDate = addDays(indentDate, -1);
      const prevIndent = await db.prepare(
        'SELECT id FROM daily_indents WHERE agent_id = ? AND indent_date = ?'
      ).get(agentId, prevDate);

      let suggestedItems = [];
      if (prevIndent) {
        const prevItems = await db.prepare(
          'SELECT * FROM daily_indent_items WHERE indent_id = ?'
        ).all(prevIndent.id);

        suggestedItems = prevItems.map(p => ({
          product_id: p.product_id,
          product_name: p.product_name,
          item_code: p.item_code,
          category: p.category,
          unit_label: p.unit_label,
          opening_stock: Number(p.closing_stock || 0),
          inward_qty: 0,
          total_available: Number(p.closing_stock || 0),
          purchase_price: Number(p.purchase_price || 0),
          selling_price: Number(p.selling_price || 0),
          margin_per_unit: Number((p.selling_price - p.purchase_price).toFixed(2)),
          closing_stock: 0,
          damaged_qty: 0,
          missing_qty: 0,
          sold_qty: 0,
          sales_revenue: 0,
          cost_of_goods_sold: 0,
          profit_earned: 0,
          notes: ''
        }));
      } else {
        suggestedItems = this.getDefaultTemplate();
      }

      return {
        exists: false,
        indent: {
          indent_date: indentDate,
          supplier_name: 'KMF / Nandini Mother Dairy',
          invoice_no: '',
          crate_deposit_amount: 0,
          other_charges: 0,
          total_inward_amount: 0,
          total_sales_amount: 0,
          total_procurement_cost: 0,
          total_margin_profit: 0,
          total_damage_loss: 0,
          total_missing_loss: 0,
          net_daily_profit: 0,
          status: 'OPEN',
          notes: ''
        },
        items: suggestedItems
      };
    }

    const items = await db.prepare(
      'SELECT * FROM daily_indent_items WHERE indent_id = ? ORDER BY id ASC'
    ).all(indent.id);

    return {
      exists: true,
      indent,
      items
    };
  }

  /**
   * Save or update an indent and its line items with full recalculation
   */
  async saveOrUpdateIndent(payload, agentId = 1) {
    const {
      indent_date,
      invoice_no = '',
      supplier_name = 'KMF / Nandini Mother Dairy',
      crate_deposit_amount = 0,
      other_charges = 0,
      status = 'OPEN',
      notes = '',
      items = []
    } = payload;

    if (!indent_date) {
      throw new Error('Indent date is required');
    }

    const depositAmt = Math.max(0, parseFloat(crate_deposit_amount) || 0);
    const otherAmt = Math.max(0, parseFloat(other_charges) || 0);

    // Calculate all items
    let totalInwardAmount = depositAmt + otherAmt;
    let totalSalesAmount = 0;
    let totalProcurementCost = 0;
    let totalMarginProfit = 0;
    let totalDamageLoss = 0;
    let totalMissingLoss = 0;

    const computedItems = items.map(it => {
      const openStock = Math.max(0, parseFloat(it.opening_stock) || 0);
      const inwardQty = Math.max(0, parseFloat(it.inward_qty) || 0);
      const totalAvail = openStock + inwardQty;

      const pPrice = Math.max(0, parseFloat(it.purchase_price) || 0);
      const sPrice = Math.max(0, parseFloat(it.selling_price) || 0);
      const marginUnit = Number((sPrice - pPrice).toFixed(2));

      const closingStock = Math.max(0, parseFloat(it.closing_stock) || 0);
      const damagedQty = Math.max(0, parseFloat(it.damaged_qty) || 0);
      const missingQty = Math.max(0, parseFloat(it.missing_qty) || 0);

      // Sold Quantity = Available - Leftover - Damaged - Missing
      const soldQty = Math.max(0, Number((totalAvail - (closingStock + damagedQty + missingQty)).toFixed(2)));

      const salesRevenue = Number((soldQty * sPrice).toFixed(2));
      const cogs = Number((soldQty * pPrice).toFixed(2));
      const grossMargin = Number((salesRevenue - cogs).toFixed(2));
      const damageLoss = Number((damagedQty * pPrice).toFixed(2));
      const missingLoss = Number((missingQty * pPrice).toFixed(2));
      const profitEarned = Number((grossMargin - damageLoss - missingLoss).toFixed(2));

      totalInwardAmount += Number((inwardQty * pPrice).toFixed(2));
      totalSalesAmount += salesRevenue;
      totalProcurementCost += cogs;
      totalMarginProfit += grossMargin;
      totalDamageLoss += damageLoss;
      totalMissingLoss += missingLoss;

      return {
        product_id: it.product_id || null,
        product_name: (it.product_name || 'Milk Product').trim(),
        item_code: (it.item_code || '').trim(),
        category: (it.category || 'Milk').trim(),
        unit_label: (it.unit_label || '500 ml').trim(),
        opening_stock: openStock,
        inward_qty: inwardQty,
        total_available: totalAvail,
        purchase_price: pPrice,
        selling_price: sPrice,
        margin_per_unit: marginUnit,
        closing_stock: closingStock,
        damaged_qty: damagedQty,
        missing_qty: missingQty,
        sold_qty: soldQty,
        sales_revenue: salesRevenue,
        cost_of_goods_sold: cogs,
        profit_earned: profitEarned,
        notes: (it.notes || '').trim()
      };
    });

    const netDailyProfit = Number((totalMarginProfit - totalDamageLoss - totalMissingLoss - otherAmt).toFixed(2));

    // Check if indent exists
    const existing = await db.prepare(
      'SELECT id FROM daily_indents WHERE agent_id = ? AND indent_date = ?'
    ).get(agentId, indent_date);

    let indentId;
    const nowStr = new Date().toISOString();

    if (existing) {
      indentId = existing.id;
      await db.prepare(`
        UPDATE daily_indents SET
          invoice_no = ?,
          supplier_name = ?,
          crate_deposit_amount = ?,
          other_charges = ?,
          total_inward_amount = ?,
          total_sales_amount = ?,
          total_procurement_cost = ?,
          total_margin_profit = ?,
          total_damage_loss = ?,
          total_missing_loss = ?,
          net_daily_profit = ?,
          status = ?,
          notes = ?,
          updated_at = ?
        WHERE id = ?
      `).run(
        invoice_no.trim(),
        supplier_name.trim(),
        depositAmt,
        otherAmt,
        totalInwardAmount,
        totalSalesAmount,
        totalProcurementCost,
        totalMarginProfit,
        totalDamageLoss,
        totalMissingLoss,
        netDailyProfit,
        status,
        notes.trim(),
        nowStr,
        indentId
      );

      // Clean old line items before inserting fresh ones
      await db.prepare('DELETE FROM daily_indent_items WHERE indent_id = ?').run(indentId);
    } else {
      const insertResult = await db.prepare(`
        INSERT INTO daily_indents (
          agent_id, indent_date, invoice_no, supplier_name,
          crate_deposit_amount, other_charges,
          total_inward_amount, total_sales_amount, total_procurement_cost,
          total_margin_profit, total_damage_loss, total_missing_loss,
          net_daily_profit, status, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        agentId,
        indent_date,
        invoice_no.trim(),
        supplier_name.trim(),
        depositAmt,
        otherAmt,
        totalInwardAmount,
        totalSalesAmount,
        totalProcurementCost,
        totalMarginProfit,
        totalDamageLoss,
        totalMissingLoss,
        netDailyProfit,
        status,
        notes.trim(),
        nowStr,
        nowStr
      );
      indentId = insertResult.lastInsertRowid;
    }

    // Insert line items
    const insertItemStmt = db.prepare(`
      INSERT INTO daily_indent_items (
        indent_id, product_id, product_name, item_code, category, unit_label,
        opening_stock, inward_qty, total_available, purchase_price, selling_price,
        margin_per_unit, closing_stock, damaged_qty, missing_qty, sold_qty,
        sales_revenue, cost_of_goods_sold, profit_earned, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of computedItems) {
      await insertItemStmt.run(
        indentId,
        item.product_id,
        item.product_name,
        item.item_code,
        item.category,
        item.unit_label,
        item.opening_stock,
        item.inward_qty,
        item.total_available,
        item.purchase_price,
        item.selling_price,
        item.margin_per_unit,
        item.closing_stock,
        item.damaged_qty,
        item.missing_qty,
        item.sold_qty,
        item.sales_revenue,
        item.cost_of_goods_sold,
        item.profit_earned,
        item.notes,
        nowStr,
        nowStr
      );
    }

    return this.getIndentByDate(indent_date, agentId);
  }

  /**
   * Push unsold leftovers (closing stock) to next day's opening stock
   */
  async pushLeftoversToNextDay(date, agentId = 1) {
    const current = await this.getIndentByDate(date, agentId);
    if (!current.exists) {
      throw new Error(`No indent found for date ${date} to push leftovers from.`);
    }

    const nextDate = addDays(date, 1);
    const nextIndent = await this.getIndentByDate(nextDate, agentId);

    // Build map of current items with closing_stock > 0
    const closingMap = {};
    for (const it of current.items) {
      if (it.closing_stock > 0) {
        closingMap[it.product_name] = it;
      }
    }

    let updatedNextItems = [];

    if (nextIndent.exists && nextIndent.items && nextIndent.items.length > 0) {
      // Merge into next day's items
      updatedNextItems = nextIndent.items.map(it => {
        const carry = closingMap[it.product_name];
        return {
          ...it,
          opening_stock: carry ? Number(carry.closing_stock) : Number(it.opening_stock || 0)
        };
      });

      // Add any products from today that aren't yet in tomorrow's list
      for (const [prodName, carryItem] of Object.entries(closingMap)) {
        const alreadyExists = updatedNextItems.some(it => it.product_name === prodName);
        if (!alreadyExists) {
          updatedNextItems.push({
            product_id: carryItem.product_id,
            product_name: carryItem.product_name,
            item_code: carryItem.item_code,
            category: carryItem.category,
            unit_label: carryItem.unit_label,
            opening_stock: Number(carryItem.closing_stock),
            inward_qty: 0,
            purchase_price: carryItem.purchase_price,
            selling_price: carryItem.selling_price,
            closing_stock: 0,
            damaged_qty: 0,
            missing_qty: 0
          });
        }
      }

      await this.saveOrUpdateIndent({
        ...nextIndent.indent,
        indent_date: nextDate,
        items: updatedNextItems
      }, agentId);
    } else {
      // Create new next day indent with opening stocks carried over
      updatedNextItems = current.items.map(it => ({
        product_id: it.product_id,
        product_name: it.product_name,
        item_code: it.item_code,
        category: it.category,
        unit_label: it.unit_label,
        opening_stock: Number(it.closing_stock || 0),
        inward_qty: 0,
        purchase_price: it.purchase_price,
        selling_price: it.selling_price,
        closing_stock: 0,
        damaged_qty: 0,
        missing_qty: 0
      }));

      await this.saveOrUpdateIndent({
        indent_date: nextDate,
        supplier_name: current.indent.supplier_name || 'KMF / Nandini Mother Dairy',
        invoice_no: '',
        crate_deposit_amount: 0,
        other_charges: 0,
        status: 'OPEN',
        notes: `Carried forward opening stock from ${date}`,
        items: updatedNextItems
      }, agentId);
    }

    return this.getIndentByDate(nextDate, agentId);
  }

  /**
   * Summary metrics: Daily, Weekly, and Monthly Sales, Costs, and Net Profits
   */
  async getProfitSummary(targetDate = null, agentId = 1) {
    const today = targetDate || getLocalDateString();
    const currentMonth = today.substring(0, 7); // YYYY-MM
    const sevenDaysAgo = addDays(today, -6);

    // 1. Today's indent
    const todayData = await db.prepare(`
      SELECT * FROM daily_indents
      WHERE agent_id = ? AND indent_date = ?
    `).get(agentId, today);

    // 2. Weekly summary (Last 7 days ending on targetDate)
    const weeklyData = await db.prepare(`
      SELECT
        COUNT(id) as total_days_recorded,
        COALESCE(SUM(total_inward_amount), 0) as total_inward_amount,
        COALESCE(SUM(total_sales_amount), 0) as total_sales_amount,
        COALESCE(SUM(total_procurement_cost), 0) as total_procurement_cost,
        COALESCE(SUM(total_margin_profit), 0) as total_margin_profit,
        COALESCE(SUM(total_damage_loss), 0) as total_damage_loss,
        COALESCE(SUM(total_missing_loss), 0) as total_missing_loss,
        COALESCE(SUM(net_daily_profit), 0) as net_weekly_profit
      FROM daily_indents
      WHERE agent_id = ? AND indent_date >= ? AND indent_date <= ?
    `).get(agentId, sevenDaysAgo, today);

    // 3. Monthly summary (Current calendar month)
    const monthlyData = await db.prepare(`
      SELECT
        COUNT(id) as total_days_recorded,
        COALESCE(SUM(total_inward_amount), 0) as total_inward_amount,
        COALESCE(SUM(total_sales_amount), 0) as total_sales_amount,
        COALESCE(SUM(total_procurement_cost), 0) as total_procurement_cost,
        COALESCE(SUM(total_margin_profit), 0) as total_margin_profit,
        COALESCE(SUM(total_damage_loss), 0) as total_damage_loss,
        COALESCE(SUM(total_missing_loss), 0) as total_missing_loss,
        COALESCE(SUM(net_daily_profit), 0) as net_monthly_profit
      FROM daily_indents
      WHERE agent_id = ? AND indent_date LIKE ?
    `).get(agentId, `${currentMonth}%`);

    // 4. Past 30 Days Trend list
    const past30DaysAgo = addDays(today, -29);
    const trendList = await db.prepare(`
      SELECT
        id, indent_date, invoice_no, status,
        total_inward_amount, total_sales_amount,
        total_margin_profit, total_damage_loss, total_missing_loss,
        net_daily_profit
      FROM daily_indents
      WHERE agent_id = ? AND indent_date >= ? AND indent_date <= ?
      ORDER BY indent_date DESC
    `).all(agentId, past30DaysAgo, today);

    // Also get today's app delivered deliveries packet count for comparison
    const delivSummary = await db.prepare(`
      SELECT
        COUNT(id) as total_deliveries,
        COALESCE(SUM(quantity), 0) as delivered_packets,
        COALESCE(SUM(total_amount), 0) as delivered_revenue
      FROM deliveries
      WHERE agent_id = ? AND delivery_date = ? AND status = 'DELIVERED'
    `).get(agentId, today);

    return {
      selectedDate: today,
      month: currentMonth,
      today: todayData || {
        indent_date: today,
        total_inward_amount: 0,
        total_sales_amount: 0,
        total_margin_profit: 0,
        total_damage_loss: 0,
        total_missing_loss: 0,
        net_daily_profit: 0,
        status: 'NOT_RECORDED'
      },
      weekly: {
        startDate: sevenDaysAgo,
        endDate: today,
        daysCount: weeklyData.total_days_recorded,
        sales: Number(weeklyData.total_sales_amount.toFixed(2)),
        inwardCost: Number(weeklyData.total_inward_amount.toFixed(2)),
        cogs: Number(weeklyData.total_procurement_cost.toFixed(2)),
        grossMargin: Number(weeklyData.total_margin_profit.toFixed(2)),
        damageLoss: Number(weeklyData.total_damage_loss.toFixed(2)),
        missingLoss: Number(weeklyData.total_missing_loss.toFixed(2)),
        netProfit: Number(weeklyData.net_weekly_profit.toFixed(2)),
        marginPercent: weeklyData.total_sales_amount > 0
          ? Number(((weeklyData.net_weekly_profit / weeklyData.total_sales_amount) * 100).toFixed(1))
          : 0
      },
      monthly: {
        month: currentMonth,
        daysCount: monthlyData.total_days_recorded,
        sales: Number(monthlyData.total_sales_amount.toFixed(2)),
        inwardCost: Number(monthlyData.total_inward_amount.toFixed(2)),
        cogs: Number(monthlyData.total_procurement_cost.toFixed(2)),
        grossMargin: Number(monthlyData.total_margin_profit.toFixed(2)),
        damageLoss: Number(monthlyData.total_damage_loss.toFixed(2)),
        missingLoss: Number(monthlyData.total_missing_loss.toFixed(2)),
        netProfit: Number(monthlyData.net_monthly_profit.toFixed(2)),
        marginPercent: monthlyData.total_sales_amount > 0
          ? Number(((monthlyData.net_monthly_profit / monthlyData.total_sales_amount) * 100).toFixed(1))
          : 0
      },
      appDeliveriesToday: {
        packets: delivSummary?.delivered_packets || 0,
        revenue: Number((delivSummary?.delivered_revenue || 0).toFixed(2))
      },
      trend: trendList
    };
  }

  /**
   * Delete an indent (Admin only)
   */
  async deleteIndent(id, agentId = 1) {
    await db.prepare('DELETE FROM daily_indents WHERE id = ? AND agent_id = ?').run(id, agentId);
    return { success: true };
  }
}

module.exports = new IndentService();

