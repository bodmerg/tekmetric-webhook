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
// key = repairOrderNumber (friendly number), value = customerName
const roCustomerCache = {};
// key = repairOrderId (internal ID), value = repairOrderNumber (friendly number)
const roIdToNumberCache = {};

app.post('/tekmetric-webhook', async (req, res) => {
  const payload = req.body;
  const event = payload.event || '';
  const data = payload.data || {};

  // Extract IDs and numbers from payload
  const repairOrderNumber = data.repairOrderNumber || null; // friendly number
  const repairOrderId = data.id || null;                     // internal ID

  // Cache customer name and map internal ID to friendly number when possible
  if (repairOrderNumber && data.customer?.firstName && data.customer?.lastName) {
    const fullName = `${data.customer.firstName} ${data.customer.lastName}`;
    roCustomerCache[repairOrderNumber] = fullName;

    if (repairOrderId) {
      roIdToNumberCache[repairOrderId] = repairOrderNumber;
    }

    console.log(`Cached customer "${fullName}" for RO #${repairOrderNumber} (ID: ${repairOrderId})`);
  }

  // Determine the friendly RO number for messaging (fallback to cached map if needed)
  let friendlyRONumber = repairOrderNumber || (repairOrderId ? roIdToNumberCache[repairOrderId] : null);
  if (!friendlyRONumber) friendlyRONumber = 'Unknown';

  // Lookup customer name preferring cached customer for this RO number
  let customerName = 'Unknown Customer';
  if (friendlyRONumber && roCustomerCache[friendlyRONumber]) {
    customerName = roCustomerCache[friendlyRONumber];
  } else if (data.customer?.firstName && data.customer?.lastName) {
    customerName = `${data.customer.firstName} ${data.customer.lastName}`;
  } else {
    const match = event.match(/^([A-Z][a-z]+\s[A-Z][a-z]+)\s(viewed|approved|declined|marked|paid|completed|made)/i);
    if (match && match[1]) {
      customerName = match[1];
    }
  }

  let message = null;

  try {
    // Estimate Viewed
    if (event.toLowerCase().includes('estimate') && event.toLowerCase().includes('viewed')) {
      message = `🧐 **Estimate Viewed**\n${customerName} viewed estimate for RO #${friendlyRONumber}`;
    }
    // Work Approved / Declined
    else if (event.toLowerCase().includes('approved') && event.toLowerCase().includes('declined')) {
      const approvedCount = data.jobs?.filter(job => job.authorized === true).length || 0;
      const declinedCount = data.jobs?.filter(job => job.authorized === false).length || 0;
      message = `🔧 **Work Authorization**\n${customerName} approved ${approvedCount} job(s) and declined ${declinedCount} job(s) for RO #${friendlyRONumber}`;
    }
    // Repair Order Completed
    else if (data.repairOrderStatus?.name?.toLowerCase() === 'complete' || data.repairOrderStatus?.name?.toLowerCase() === 'completed') {
      message = `🎉 **RO Completed**\nRO #${friendlyRONumber} for ${customerName} is marked as completed.`;
    }
    // Payment Received (fully paid)
    else if (data.amountPaid && data.amountPaid > 0 && data.totalSales && data.amountPaid === data.totalSales) {
      const total = (data.amountPaid / 100).toFixed(2);
      message = `💳 **Payment Received**\nRO #${friendlyRONumber} for ${customerName} has been paid in full.\nTotal: $${total}`;
    }
    // Payment Made (partial or any payment event)
    else if (event.toLowerCase().includes('payment made')) {
      const amount = data.amount ? (data.amount / 100).toFixed(2) : 'Unknown';
      const payer = data.payerName || customerName;
      message = `💵 **Payment Made**\n${payer} paid $${amount} for RO #${friendlyRONumber}`;
    }
    // Inspection Completed
    else if (event.toLowerCase().includes('inspection') && event.toLowerCase().includes('complete')) {
      message = `🔍 **Inspection Complete**\n${data.name || 'Inspection'} completed for RO #${friendlyRONumber} for ${customerName}`;
    }
    // Part Received
    else if (event.toLowerCase().includes('purchase order') && event.toLowerCase().includes('received')) {
      const poMatch = event.match(/Purchase Order #(\d+)/);
      const poNumber = poMatch ? poMatch[1] : 'Unknown';
      message = `📦 **Part Received**\nPurchase Order #${poNumber} marked as received.`;
    }

    if (message) {
      await axios.post(DISCORD_WEBHOOK_URL, { content: message });
      res.status(200).send('Notification sent to Discord');
    } else {
      res.status(200).send('No matching event handled');
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
    res.status(500).send('Error handling webhook');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Tekmetric webhook listener running on port ${PORT}`));
