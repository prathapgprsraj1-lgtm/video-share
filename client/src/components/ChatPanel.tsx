import React, { useState, useRef, useEffect } from 'react';
import type { Message, Guest } from '../types';
import { GifPickerModal } from './GifPickerModal';
import { ImageViewerModal } from './ImageViewerModal';
import {
  Send,
  Paperclip,
  Reply,
  Edit2,
  Trash2,
  X,
  FileText,
  Download,
  Sparkles,
} from 'lucide-react';

interface ChatPanelProps {
  messages: Message[];
  currentGuest: Guest;
  onSendMessage: (content: string, type?: string, replyToId?: string) => void;
  onUploadFile: (file: File, caption?: string) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onTyping: (isTyping: boolean) => void;
  typingUsers: string[];
}

const COMMON_EMOJIS = ['👍', '❤️', '😂', '🎉', '🔥', '🚀'];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  currentGuest,
  onSendMessage,
  onUploadFile,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  onTyping,
  typingUsers,
}) => {
  const [inputText, setInputText] = useState('');
  const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isGifModalOpen, setIsGifModalOpen] = useState(false);
  const [zoomedImageUrl, setZoomedImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<any>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputText(e.target.value);

    // Typing status notify
    onTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      onTyping(false);
    }, 2000);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    onSendMessage(inputText.trim(), 'text', replyToMessage?.id);
    setInputText('');
    setReplyToMessage(null);
    onTyping(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      await onUploadFile(file);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSelectGif = (url: string) => {
    onSendMessage(url, 'gif', replyToMessage?.id);
    setReplyToMessage(null);
  };

  const handleSaveEdit = (messageId: string) => {
    if (!editContent.trim()) return;
    onEditMessage(messageId, editContent.trim());
    setEditingMessageId(null);
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 border-l border-gray-800 w-full sm:w-80 md:w-96 select-none">
      {/* Header */}
      <div className="h-14 px-4 border-b border-gray-800 flex items-center justify-between shrink-0">
        <h3 className="font-bold text-white text-sm flex items-center gap-2">
          Room Chat
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 font-medium">
            {messages.length}
          </span>
        </h3>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 py-12">
            <Sparkles className="w-8 h-8 text-indigo-400/40 mb-2" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs text-gray-500 mt-1">Say hello to other anonymous guests!</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_guest_id === currentGuest.id;
            const isSystem = msg.message_type === 'system';

            if (isSystem) {
              return (
                <div key={msg.id} className="text-center my-2">
                  <span className="text-[11px] px-3 py-1 rounded-full bg-gray-800/60 text-gray-400 border border-gray-800">
                    {msg.content}
                  </span>
                </div>
              );
            }

            const firstAttachment = msg.attachments && msg.attachments.length > 0 ? msg.attachments[0] : null;

            return (
              <div
                key={msg.id}
                className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'} relative transition-all`}
              >
                {/* Reply To Preview */}
                {msg.reply_to && (
                  <div className="text-[11px] text-gray-400 flex items-center gap-1 mb-1 pl-2 border-l-2 border-indigo-500/50">
                    <span className="font-semibold text-indigo-300">Replying to {msg.reply_to.sender_name}:</span>
                    <span className="truncate max-w-[160px]">{msg.reply_to.content}</span>
                  </div>
                )}

                {/* Message Header */}
                <div className="flex items-center gap-1.5 mb-1 text-xs">
                  {!isMe && (
                    <img
                      src={msg.sender_avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=guest'}
                      alt=""
                      className="w-4 h-4 rounded-full"
                    />
                  )}
                  <span className={`font-semibold ${isMe ? 'text-indigo-300' : 'text-gray-300'}`}>
                    {msg.sender_name || 'Guest'}
                  </span>
                  <span className="text-[10px] text-gray-500">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Message Bubble */}
                <div className="relative group/bubble max-w-[88%]">
                  {editingMessageId === msg.id ? (
                    <div className="bg-gray-800 border border-indigo-500 rounded-xl p-2.5">
                      <input
                        type="text"
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1 text-sm text-white outline-none mb-2"
                        autoFocus
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingMessageId(null)}
                          className="px-2 py-0.5 rounded text-xs text-gray-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(msg.id)}
                          className="px-2.5 py-0.5 rounded bg-indigo-600 text-xs font-semibold text-white"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={`p-3 rounded-2xl text-sm break-words ${
                        isMe
                          ? 'bg-indigo-600 text-white rounded-tr-sm'
                          : 'bg-gray-800 text-gray-200 rounded-tl-sm border border-gray-750'
                      }`}
                    >
                      {/* Media: GIF */}
                      {msg.message_type === 'gif' && (
                        <div className="rounded-xl overflow-hidden mb-1">
                          <img
                            src={msg.content}
                            alt="GIF"
                            className="max-h-60 w-auto rounded-xl object-contain cursor-pointer hover:opacity-95"
                            onClick={() => setZoomedImageUrl(msg.content)}
                          />
                        </div>
                      )}

                      {/* Media: Uploaded Image */}
                      {msg.message_type === 'image' && firstAttachment && (
                        <div className="rounded-xl overflow-hidden mb-1">
                          <img
                            src={`/api/attachments/${firstAttachment.id}`}
                            alt={firstAttachment.original_filename}
                            className="max-h-60 w-auto rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity"
                            onClick={() => setZoomedImageUrl(`/api/attachments/${firstAttachment.id}`)}
                          />
                        </div>
                      )}

                      {/* Media: Uploaded Video */}
                      {msg.message_type === 'video' && firstAttachment && (
                        <div className="rounded-xl overflow-hidden mb-1 max-w-xs">
                          <video
                            src={`/api/attachments/${firstAttachment.id}`}
                            controls
                            className="w-full rounded-xl"
                          />
                        </div>
                      )}

                      {/* Media: Generic File Attachment */}
                      {msg.message_type === 'file' && firstAttachment && (
                        <a
                          href={`/api/attachments/${firstAttachment.id}`}
                          download={firstAttachment.original_filename}
                          className="flex items-center gap-2 p-2 rounded-xl bg-black/20 hover:bg-black/30 border border-white/10 text-white text-xs mb-1"
                        >
                          <FileText className="w-4 h-4 text-indigo-300 shrink-0" />
                          <span className="truncate flex-1 font-medium">{firstAttachment.original_filename}</span>
                          <Download className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        </a>
                      )}

                      {/* Text content if not media-only */}
                      {msg.message_type === 'text' && <span>{msg.content}</span>}
                    </div>
                  )}

                  {/* Hover Action Bar */}
                  <div
                    className={`absolute -top-3 ${
                      isMe ? 'right-0' : 'left-0'
                    } hidden group-hover/bubble:flex items-center gap-0.5 p-1 rounded-lg bg-gray-950/90 border border-gray-700/80 shadow-lg backdrop-blur-sm z-20`}
                  >
                    {/* Quick Reactions */}
                    {COMMON_EMOJIS.slice(0, 3).map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => onToggleReaction(msg.id, emoji)}
                        className="px-1 py-0.5 text-xs hover:scale-125 transition-transform"
                      >
                        {emoji}
                      </button>
                    ))}

                    <button
                      onClick={() => setReplyToMessage(msg)}
                      title="Reply"
                      className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
                    >
                      <Reply className="w-3 h-3" />
                    </button>

                    {isMe && (
                      <>
                        <button
                          onClick={() => {
                            setEditingMessageId(msg.id);
                            setEditContent(msg.content);
                          }}
                          title="Edit"
                          className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-white"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => onDeleteMessage(msg.id)}
                          title="Delete"
                          className="p-1 rounded hover:bg-rose-500/20 text-gray-400 hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Reactions list */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {msg.reactions.map((r) => {
                      const reactedByMe = r.users.includes(currentGuest.id);
                      return (
                        <button
                          key={r.emoji}
                          onClick={() => onToggleReaction(msg.id, r.emoji)}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors ${
                            reactedByMe
                              ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                              : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          <span>{r.emoji}</span>
                          <span className="font-semibold">{r.count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Typing Indicator */}
      {typingUsers.length > 0 && (
        <div className="px-4 py-1 text-xs text-indigo-400 italic flex items-center gap-1.5 shrink-0 bg-gray-900/60">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          {typingUsers.join(', ')} {typingUsers.length > 1 ? 'are' : 'is'} typing...
        </div>
      )}

      {/* Reply Banner */}
      {replyToMessage && (
        <div className="px-4 py-2 bg-gray-800/90 border-t border-gray-700 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-1.5 text-gray-300 truncate">
            <Reply className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>Replying to <b className="text-white">{replyToMessage.sender_name}</b>:</span>
            <span className="truncate text-gray-400">{replyToMessage.content}</span>
          </div>
          <button onClick={() => setReplyToMessage(null)} className="p-0.5 text-gray-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Composer Input Form */}
      <form onSubmit={handleSend} className="p-3 border-t border-gray-800 bg-gray-950/70 shrink-0">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,video/*,audio/*,.pdf,.txt"
        />

        <div className="flex items-center gap-1.5 bg-gray-800/90 border border-gray-700/80 rounded-2xl p-1.5 focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500 transition-all">
          {/* File Upload Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="Upload Image or Attachment"
            className="p-2 rounded-xl text-gray-400 hover:text-indigo-400 hover:bg-gray-700/60 transition-colors"
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* GIF Picker Button */}
          <button
            type="button"
            onClick={() => setIsGifModalOpen(true)}
            title="Search GIFs"
            className="px-2 py-1 rounded-xl text-xs font-bold text-gray-400 hover:text-indigo-400 hover:bg-gray-700/60 transition-colors"
          >
            GIF
          </button>

          {/* Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={handleInputChange}
            placeholder={isUploading ? 'Uploading attachment...' : 'Type a message...'}
            disabled={isUploading}
            className="flex-1 bg-transparent px-2 py-1 text-sm text-white placeholder-gray-500 outline-none"
          />

          {/* Send Button */}
          <button
            type="submit"
            disabled={!inputText.trim() || isUploading}
            className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all shadow-md shadow-indigo-600/30"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>

      {/* Modals */}
      <GifPickerModal
        isOpen={isGifModalOpen}
        onClose={() => setIsGifModalOpen(false)}
        onSelectGif={handleSelectGif}
      />

      <ImageViewerModal
        imageUrl={zoomedImageUrl}
        onClose={() => setZoomedImageUrl(null)}
      />
    </div>
  );
};
