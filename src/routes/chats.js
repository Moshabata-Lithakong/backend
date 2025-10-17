const express = require('express');
const { protect } = require('../middleware/auth');
const {
  getOrCreateChat,
  getUserChats,
  getChatMessages,
  sendMessage,
  markMessagesAsRead,
  deleteChat,
} = require('../controllers/chatController');

const router = express.Router();

// Protect all routes after this middleware
router.use(protect);

router.get('/', getUserChats);
router.post('/', getOrCreateChat);

router.get('/:chatId/messages', getChatMessages);
router.post('/:chatId/messages', sendMessage);
router.patch('/:chatId/read', markMessagesAsRead);
router.delete('/:chatId', deleteChat);

module.exports = router;