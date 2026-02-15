'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardHeader, Button } from '@/components/ui';
import { Send, Bot, User, Lightbulb, CheckCircle, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types';

interface ChatThreadProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  onStart?: () => void;
  canStart?: boolean;
  onAddDraftToTodo?: (sentences: string[]) => void;
  onAcceptDraft?: (sentences: string[]) => void;
  isLoading?: boolean;
}

export function ChatThread({
  messages,
  onSendMessage,
  onStart,
  canStart = true,
  onAddDraftToTodo,
  onAcceptDraft,
  isLoading
}: ChatThreadProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isInputDisabled = Boolean(isLoading) || (!canStart && messages.length === 0);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isInputDisabled) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <Card className="flex flex-col h-[600px]">
      <CardHeader
        title="Oral Defense"
        subtitle="査読官からの質問に答え、論理の穴を発見しましょう"
        icon={<Bot className="w-5 h-5 text-indigo-600" />}
      />

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <Bot className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600">
              「開始」ボタンを押して、口頭試問を始めましょう。
            </p>
            <div className="flex justify-center">
              <Button
                type="button"
                onClick={onStart}
                disabled={!onStart || !canStart || isLoading}
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                口頭試問を開始
              </Button>
            </div>
            {!canStart && (
              <p className="text-xs text-amber-700">
                解析完了後に開始できます。
              </p>
            )}
            <div className="text-left max-w-xl mx-auto rounded-md border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-700 mb-2">おすすめ質問</p>
              <ul className="text-xs text-gray-600 space-y-1">
                <li>・この研究の新規性はどこですか？</li>
                <li>・再現性を示すために何を追記すべき？</li>
                <li>・最も弱い主張はどこで、どう補強する？</li>
              </ul>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            onAddDraftToTodo={onAddDraftToTodo}
            onAcceptDraft={onAcceptDraft}
          />
        ))}

        {isLoading && (
          <div className="flex items-center gap-2 text-gray-500">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-100" />
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-200" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={messages.length === 0 ? '開始後に質問へ回答できます' : '回答を入力...'}
            disabled={isInputDisabled}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
          />
          <Button type="submit" disabled={isInputDisabled || !input.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MessageItem({
  message,
  onAddDraftToTodo,
  onAcceptDraft
}: {
  message: ChatMessage
  onAddDraftToTodo?: (sentences: string[]) => void
  onAcceptDraft?: (sentences: string[]) => void
}) {
  const isAI = message.type === 'ai_question' || message.type === 'ai_evaluation';
  const isDraft = message.type === 'draft';

  return (
    <div
      className={cn(
        'flex gap-3',
        isAI ? '' : 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isAI ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-200 text-gray-600'
        )}
      >
        {isAI ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
      </div>

      {/* Content */}
      <div
        className={cn(
          'max-w-[80%] rounded-lg p-3',
          isAI
            ? 'bg-gray-100 text-gray-900'
            : isDraft
            ? 'bg-green-50 border border-green-200 text-gray-900'
            : 'bg-indigo-600 text-white'
        )}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

        {/* Metadata */}
        {message.metadata?.severity && (
          <div className="mt-2">
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded',
                message.metadata.severity === 'critical'
                  ? 'bg-red-100 text-red-800'
                  : message.metadata.severity === 'warning'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-blue-100 text-blue-800'
              )}
            >
              {message.metadata.severity === 'critical'
                ? '致命傷'
                : message.metadata.severity === 'warning'
                ? '警告'
                : '情報'}
            </span>
          </div>
        )}

        {/* Draft actions */}
        {isDraft && message.metadata?.draft_sentences && (
          <div className="mt-3 space-y-2">
            {message.metadata.draft_sentences.map((sentence, index) => (
              <div
                key={index}
                className="p-2 bg-white rounded border border-gray-200 text-sm"
              >
                {sentence}
              </div>
            ))}
            <div className="flex gap-2 mt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!onAddDraftToTodo || message.metadata.draft_sentences.length === 0}
                onClick={() => onAddDraftToTodo?.(message.metadata?.draft_sentences ?? [])}
              >
                <CheckCircle className="w-4 h-4 mr-1" />
                ToDoに追加
              </Button>
              <Button
                onClick={() => onAcceptDraft?.(message.metadata?.draft_sentences ?? [])}
                size="sm"
                disabled={!onAcceptDraft || message.metadata.draft_sentences.length === 0}
              >
                <Lightbulb className="w-4 h-4 mr-1" />
                採用
              </Button>
            </div>
          </div>
        )}

        <p className={cn('text-xs mt-2', isAI || isDraft ? 'text-gray-500' : 'text-indigo-100')}>
          {new Date(message.timestamp).toLocaleTimeString('ja-JP')}
        </p>
      </div>
    </div>
  );
}
