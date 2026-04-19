const express = require('express');
const http = require('http');
const cors = require('cors');
const compression = require('compression');
const dotenv = require('dotenv');
const { Server } = require('socket.io');
const connectDB = require('./config/db');
const { setIO } = require('./services/socket');

dotenv.config();
connectDB();

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://bkfrontend.vercel.app'
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true
  })
);

app.use(compression());
app.use(express.json());

app.get('/', (req, res) => res.send('Scholar Awards Event Backend running'));

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/roles', require('./routes/crudRoutes')(require('./models/Role')));
app.use('/api/users', require('./routes/crudRoutes')(require('./models/User'), 'roleId categoriesAssigned'));
app.use('/api/events', require('./routes/crudRoutes')(require('./models/Event')));
app.use('/api/categories', require('./routes/crudRoutes')(require('./models/Category'), 'anchorId backupAnchorIds preferredGuestIds'));
app.use('/api/students', require('./routes/studentRoutes'));
app.use('/api/stage-assignments', require('./routes/stageRoutes'));
app.use('/api/notifications', require('./routes/crudRoutes')(require('./models/Notification')));
app.use('/api/donations', require('./routes/crudRoutes')(require('./models/Donation'), 'donorGuestId receivedByUserId'));
app.use('/api/automation-rules', require('./routes/crudRoutes')(require('./models/AutomationRule')));
app.use('/api/certificate-templates', require('./routes/crudRoutes')(require('./models/CertificateTemplate')));
app.use('/api/teams', require('./routes/crudRoutes')(require('./models/Team'), 'leadUserId memberUserIds'));
app.use('/api/budget-heads', require('./routes/crudRoutes')(require('./models/BudgetHead'), 'responsibleTeamId responsibleUserId'));
app.use('/api/vendors', require('./routes/crudRoutes')(require('./models/Vendor'), 'budgetHeadId responsibleTeamId responsibleUserId'));
app.use('/api/expenses', require('./routes/crudRoutes')(require('./models/Expense'), 'budgetHeadId vendorId paidByUserId approvedByUserId'));
app.use('/api/event-tasks', require('./routes/crudRoutes')(require('./models/EventTask'), 'teamId assignedToUserId backupUserId linkedVendorId'));
app.use('/api/whatsapp', require('./routes/whatsappRoutes'));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true
  }
});

setIO(io);

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);
  socket.on('join-role-room', (role) => socket.join(`role:${role}`));
  socket.on('disconnect', () => console.log('socket disconnected', socket.id));
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));