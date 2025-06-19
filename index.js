// Required packages
const express = require('express');
const axios = require('axios');
const app = express();

const DISCORD_WEBHOOK_URL = 'YOUR_DISCORD_WEBHOOK_URL_HERE';

app.use(express.json());

app.post('/webhook', async (req, res) => {
  const { event, data } = req.body;

  // Debug logs
  console.log('✅ Received webhook event:', event);
  console.log('📝 Full payload:', JSON.stringify(data, null, 2));

  let message = '';

  try {
    switch (true) {
      case event.includes('completed'):
        message = formatWorkCompleted(data);
        break;
      case event.includes('Payment made'):
        message = formatPayment(data);
        break;
      case event.includes('approved') && event.includes('declined'):
        message = formatAuthorization(data);
        break;
      case event.includes('viewed estimate'):
        message = formatEstimateViewed(data);
        break;
      case event.includes('Purchase Order') && event.includes('received'):
        message = formatPartsReceived(data);
        break;
      case event.includes('Inspection marked complete'):
        message = formatInspection(data);
        break;
      default:
        console.log('⚠️ Unknown or ignored event.');
        return res.status(200).send('Ignored');
    }

    if (message) {
      console.log('📤 Sending to Discord:
', message);
      await axios.post(DISCORD_WEBHOOK_URL, { content: message });
    }

    res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Webhook handler error:', err);
    res.status(500).send('Error');
  }
});

function formatWorkCompleted(data) {
  const ro = data.repairOrderNumber;
  const customerName = 'Grant Bodmer'; // Pull dynamically if added later
  const completedDate = new Date(data.completedDate).toLocaleString();
  const jobs = data.jobs.map(job => `- ${job.name}\n  - Labor Hours: ${job.laborHours}\n  - Labor Cost: $${job.laborTotal}`).join('\n');
  const fees = data.fees.map(fee => `- ${fee.name}: $${fee.total}`).join('\n');
  return `**🔧 Repair Order #${ro} - ${customerName}**\nWork has been completed.\nCompleted on: ${completedDate}\n\n**Services Performed:**\n${jobs}\n\n**Fees:**\n${fees}\n\n**Total Sales:** $${data.totalSales}`;
}

function formatPayment(data) {
  const amount = data.amount;
  const paidInFull = data.amount >= 2700 ? '✅ Paid in Full' : '⚠️ Partially Paid';
  return `**🧾 Repair Order #${data.repairOrderId} - ${data.payerName}**\n💰 Payment Received: **$${amount}** (${data.paymentType.name})\n📅 Payment Date: ${new Date(data.paymentDate).toLocaleString()}\n${paidInFull}`;
}

function formatAuthorization(data) {
  const approved = data.jobs.filter(job => job.authorized).length;
  const declined = data.jobs.length - approved;
  const name = `${data.customer.firstName} ${data.customer.lastName}`;
  return `**✅ Repair Order #${data.repairOrderNumber} - ${name}**\nCustomer approved ${approved} job(s) and declined ${declined} job(s).`;
}

function formatEstimateViewed(data) {
  const name = `${data.customer.firstName} ${data.customer.lastName}`;
  return `**👀 Repair Order #${data.repairOrderNumber} - ${name}**\nCustomer viewed the estimate.`;
}

function formatPartsReceived(data) {
  return `**📦 Purchase Order #${data.purchaseOrderId}**\nParts have been received for this order.`;
}

function formatInspection(data) {
  const inspectionName = data.name;
  const completedDate = new Date(data.completedDate).toLocaleString();
  const ro = data.repairOrderId;
  const customerName = 'Grant Bodmer'; // If available, replace with actual
  const details = data.inspectionTasks.map(group => {
    const tasks = group.tasks.map(task => {
      let emoji = '✅';
      if (task.inspectionRating === 'Fair') emoji = '⚠️';
      else if (task.inspectionRating === 'Poor' || task.reported) emoji = '❌';
      const status = task.inspectionRating || (task.reported ? 'Issue Found' : 'No Issues');
      const finding = task.finding ? ` (${task.finding})` : '';
      return `- ${task.name} — ${emoji} ${status}${finding}`;
    }).join('\n');
    return `**${group.title.trim()}**\n${tasks}`;
  }).join('\n\n');

  return `**🔍 Repair Order #${ro} - ${customerName}**\nInspection "**${inspectionName}**" has been completed.\nCompleted on: ${completedDate}\n\n**Inspection Details:**\n\n${details}`;
}

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook server listening on port ${PORT}`);
});

