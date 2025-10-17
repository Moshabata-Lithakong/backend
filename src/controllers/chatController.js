const Chat = require('../models/Chat');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

exports.getOrCreateChat = catchAsync(async (req, res, next) => {
  const { participantId, orderId } = req.body;

  if (!participantId) {
    return next(new AppError('Participant ID is required', 400));
  }

  // Check if chat already exists between these participants
  let chat = await Chat.findOne({
    participants: { $all: [req.user.id, participantId] },
    ...(orderId && { orderId })
  }).populate('participants', 'profile');

  if (!chat) {
    // Create new chat
    chat = await Chat.create({
      participants: [req.user.id, participantId],
      orderId: orderId || null,
      messages: []
    });

    chat = await Chat.findById(chat._id).populate('participants', 'profile');
  }

  res.status(200).json({
    status: 'success',
    data: {
      chat,
    },
  });
});

exports.getUserChats = catchAsync(async (req, res, next) => {
  const chats = await Chat.find({
    participants: req.user.id
  })
    .populate('participants', 'profile')
    .sort({ lastMessageAt: -1 });

  res.status(200).json({
    status: 'success',
    results: chats.length,
    data: {
      chats,
    },
  });
});

exports.getChatMessages = catchAsync(async (req, res, next) => {
  const chat = await Chat.findById(req.params.chatId);

  if (!chat) {
    return next(new AppError('Chat not found', 404));
  }

  // Check if user is participant in this chat
  if (!chat.participants.includes(req.user.id)) {
    return next(new AppError('You are not authorized to view this chat', 403));
  }

  res.status(200).json({
    status: 'success',
    data: {
      messages: chat.messages,
    },
  });
});

exports.sendMessage = catchAsync(async (req, res, next) => {
  const { message } = req.body;

  if (!message || message.trim().length === 0) {
    return next(new AppError('Message content is required', 400));
  }

  const chat = await Chat.findById(req.params.chatId);

  if (!chat) {
    return next(new AppError('Chat not found', 404));
  }

  // Check if user is participant in this chat
  if (!chat.participants.includes(req.user.id)) {
    return next(new AppError('You are not authorized to send messages in this chat', 403));
  }

  // Add message to chat
  await chat.addMessage(req.user.id, message.trim());

  const updatedChat = await Chat.findById(chat._id)
    .populate('participants', 'profile');

  // Emit real-time message
  const io = req.app.get('io');
  io.to(`chat_${chat._id}`).emit('new_message', {
    chatId: chat._id,
    message: updatedChat.messages[updatedChat.messages.length - 1],
    sender: req.user
  });

  res.status(200).json({
    status: 'success',
    data: {
      message: updatedChat.messages[updatedChat.messages.length - 1],
    },
  });
});

exports.markMessagesAsRead = catchAsync(async (req, res, next) => {
  const chat = await Chat.findById(req.params.chatId);

  if (!chat) {
    return next(new AppError('Chat not found', 404));
  }

  // Check if user is participant in this chat
  if (!chat.participants.includes(req.user.id)) {
    return next(new AppError('You are not authorized to update this chat', 403));
  }

  // Mark all unread messages from other participants as read
  chat.messages.forEach(msg => {
    if (msg.senderId.toString() !== req.user.id && !msg.read) {
      msg.read = true;
    }
  });

  await chat.save();

  res.status(200).json({
    status: 'success',
    data: {
      chat,
    },
  });
});

exports.deleteChat = catchAsync(async (req, res, next) => {
  const chat = await Chat.findById(req.params.chatId);

  if (!chat) {
    return next(new AppError('Chat not found', 404));
  }

  // Check if user is participant in this chat
  if (!chat.participants.includes(req.user.id)) {
    return next(new AppError('You are not authorized to delete this chat', 403));
  }

  await Chat.findByIdAndDelete(req.params.chatId);

  res.status(204).json({
    status: 'success',
    data: null,
  });
});