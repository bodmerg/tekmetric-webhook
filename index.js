// index.js
const express = require('express');
const axios = require('axios');
const app = express();

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
if (!DISCORD_WEBHOOK_URL) {
  console.error('Error: DISCORD_WEBHOOK_URL environment variable not set.');
  process.exit(1);
}

app.use(express.json());

// Caches:
// roCustomerCache: key = repairOrderNumber, value = customerName
// idToRoCache: key = repairOrderId, value = repairOrderNumber (for payment/refund events)
const roCustomerCache = {};
const idToRoCache = {};

app.post('/tekmetric-webhook', async (req, res) => {
  const payload = req.body;
  const event = payload.event || '';
  const data = payload.data || {};

  // Extract IDs
  const repairOrderNumber = data.repairOrderNumber || null;
  const repairOrderId = data.id || data.repairOrderId || null;

  // Determine customerName from data or event string
  let customerName = 'Unknown Customer';

  // Try to get customer name from payload data first
  if (data.customer?.firstName && data.customer?.lastName) {
    customerName = `${data.customer.firstName} ${data.customer.lastName}`;
  } else {
    // Try to parse customer name from event string like "Grant Bodmer approved..."
    const match = event.match(/^([A-Z][a-z]+\s[A-Z][a-z]+)/);
    if (match && match[1]) {
      customerName = match[1];
    }
  }

  // Cache repairOrderNumber <-> customerName mapping if we have both
  if (repairOrderNumber && customerName !== 'Unknown Customer') {
    roCustomerCache[repairOrderNumber] = customerName;
    console.log(`[CACHE] Stored customer name "${customerName}" for RO #${repairOrderNumber}`);
  }

  // Cache repairOrderId <-> repairOrderNumber mapping
  if (repairOrderId && repairOrderNumber) {
    idToRoCache[repairOrderId] = repairOrderNumber;
    console.log(`[CACHE] Stored RO ID ${repairOrderId} => RO #${repairOrderNumber}`);
  }

  // For events where repairOrderNumber is missing, try to get it from repairOrderId
  const effectiveRoNumber = repairOrderNumber || (repairOrderId && idToRoCache[repairOrderId]) || null;

  // For customer name, if still unknown, try to get from cache by RO number
  if ((customerName === 'Unknown Customer') && effectiveRoNumber && roCustomerCache[effectiveRoNumber]) {
    customerName = roCustomerCache[effectiveRoNumber];
    console.log(`[CACHE HIT] Found customer name "${customerName}" for RO #${effectiveRoNumber}`);
  }

  let message = null;

  try {
    // Estimate Viewed
    if (event.toLowerCase().includes('estimate') && event.toLowerCase().includes('viewed')) {
      message = `🧐 **Estimate Viewed**\n${customerName} viewed estimate for RO #${effectiveRoNumber || 'Unknown'}`;
    }
    // Work Approved / Declined
    else if (event.toLowerCase().includes('approved') && event.toLowerCase().includes('declined')) {
      const approvedCount = data.jobs?.filter(job => job.authorized === true).length || 0;
      const declinedCount = data.jobs?.filter(job => job.authorized === false).length || 0;
      message = `🔧 **Work Authorization**\n${customerName} approved ${approvedCount} job(s) and declined ${declinedCount} job(s) for RO #${effectiveRoNumber || 'Unknown'}`;
    }
    // Repair Order Completed
    else if (data.repairOrderStatus?.name?.toLowerCase() === 'complete' || data.repairOrderStatus?.name?.toLowerCase() === 'completed') {
      message = `🎉 **RO Completed**\nRO #${effectiveRoNumber || 'Unknown'} for ${customerName} is marked as completed.`;
    }
    // Payment Received (fully paid)
    else if (data.amountPaid && data.amountPaid > 0 && data.totalSales && data.amountPaid === data.totalSales) {
      const total = (data.amountPaid / 100).toFixed(2);
      message = `💳 **Payment Received**\nRO #${effectiveRoNumber || 'Unknown'} for ${customerName} has been paid in full.\nTotal: $${total}`;
    }
    // Payment Made (partial or any payment event)
    else if (event.toLowerCase().includes('payment made')) {
      const amount = data.amount ? (data.amount / 100).toFixed(2) : 'Unknown';
      const payer = data.payerName || customerName;
      message = `💵 **Payment Made**\n${payer} paid $${amount} for RO #${effectiveRoNumber || 'Unknown'}`;
    }
    // Inspection Completed
    else if (event.toLowerCase().includes('inspection') && event.toLowerCase().includes('complete')) {
      message = `🔍 **Inspection Complete**\n${data.name || 'Inspection'} completed for RO #${effectiveRoNumber || 'Unknown'} for ${customerName}`;
    }
    // Part Received
    else if (event.toLowerCase().includes('purchase order') && event.toLowerCase().includes('received')) {
      const poMatch = event.match(/Purchase Order #(\d+)/);
      const poNumber = poMatch ? poMatch[1] : 'Unknown';
      message = `📦 **Part Received**\nPurchase Order #${poNumber} marked as received.`;
    }

    if (message) {
      console.log(`[EVENT RECEIVED] Event: "${event}" | RO #: ${effectiveRoNumber || 'Unknown'} | Customer: ${customerName}`);
      await axios.post(DISCORD_WEBHOOK_URL, { content: message });
      res.status(200).send('Notification sent to Discord');
    } else {
      console.log(`[NO HANDLER] Event: "${event}"`);
      res.status(200).send('No matching event handled');
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).send('Error handling webhook');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Tekmetric webhook listener running on port ${PORT}`));
