'use client';

import { useState } from 'react';
import { settingsApi } from '@/api';
import { useAppStore } from '@/store/useAppStore';
import { Card, CardHeader, Button } from '@/components/ui';
import { AlertTriangle, Trash2, Save, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { userSettings, setUserSettings, sessions, removeSession } = useAppStore();
  const [localSettings, setLocalSettings] = useState(userSettings);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await settingsApi.update({
        save_enabled: localSettings.save_enabled,
        retention_days: localSettings.retention_days,
        language: localSettings.default_language
      });
      setUserSettings(localSettings);
      setSaveMessage('設定を保存しました');
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : '設定保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAll = () => {
    // Delete all sessions
    sessions.forEach((session) => {
      removeSession(session.session_id);
    });
    setShowDeleteConfirm(false);
  };

  const hasChanges = JSON.stringify(localSettings) !== JSON.stringify(userSettings);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">設定</h1>

      {/* Privacy Settings */}
      <Card>
        <CardHeader
          title="プライバシー設定"
          subtitle="データの保存と保持期間を管理します"
          icon={<Shield className="w-5 h-5 text-indigo-600" />}
        />

        <div className="space-y-6">
          {/* Save enabled */}
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="saveEnabled"
              checked={localSettings.save_enabled}
              onChange={(e) =>
                setLocalSettings({ ...localSettings, save_enabled: e.target.checked })
              }
              className="w-4 h-4 mt-1 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <div>
              <label htmlFor="saveEnabled" className="font-medium text-gray-900">
                解析結果を保存する
              </label>
              <p className="text-sm text-gray-600 mt-1">
                解析結果や履歴をブラウザに保存します。OFFにすると、
                セッション終了時にデータが削除されます。
              </p>
            </div>
          </div>

          {/* Retention days */}
          <div>
            <label className="block font-medium text-gray-900 mb-2">
              データ保持期間
            </label>
            <select
              value={localSettings.retention_days}
              onChange={(e) =>
                setLocalSettings({
                  ...localSettings,
                  retention_days: parseInt(e.target.value),
                })
              }
              disabled={!localSettings.save_enabled}
              className={cn(
                'w-full px-4 py-2 border border-gray-300 rounded-md',
                'focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500',
                !localSettings.save_enabled && 'bg-gray-100 text-gray-500'
              )}
            >
              <option value={1}>1日</option>
              <option value={7}>1週間</option>
              <option value={30}>30日</option>
              <option value={90}>90日</option>
            </select>
            <p className="text-sm text-gray-600 mt-1">
              保持期間を過ぎたデータは自動的に削除されます。
            </p>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={!hasChanges || isSaving} isLoading={isSaving}>
              <Save className="w-4 h-4 mr-2" />
              設定を保存
            </Button>
          </div>
          {saveMessage && (
            <p className="text-sm text-gray-700">{saveMessage}</p>
          )}
        </div>
      </Card>

      {/* External API Notice */}
      <Card>
        <CardHeader
          title="外部APIについて"
          subtitle="データの送信先と処理内容"
        />
        <div className="p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-700 mb-4">
            本サービスでは、以下の処理で外部のAIモデルにデータが送信されます：
          </p>
          <ul className="text-sm text-gray-700 space-y-2 list-disc list-inside">
            <li>論文の構文解析と論理構造の抽出</li>
            <li>主張と根拠の対応関係の分析</li>
            <li>口頭試問シミュレーションの生成</li>
            <li>修正候補（Patch）の生成</li>
          </ul>
          <p className="text-sm text-gray-700 mt-4">
            送信されるデータは論文の本文テキストとメタデータのみです。
            個人情報は収集・保存されません。
          </p>
        </div>
      </Card>

      {/* Data Deletion */}
      <Card className="border-red-200">
        <CardHeader
          title="データ削除"
          subtitle="保存されたすべてのデータを削除します"
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
        />
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            現在保存されている{sessions.length}件のセッションデータをすべて削除します。
            この操作は元に戻せません。
          </p>

          {showDeleteConfirm ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                キャンセル
              </Button>
              <Button variant="danger" onClick={handleDeleteAll}>
                <Trash2 className="w-4 h-4 mr-2" />
                すべて削除する
              </Button>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              データを削除
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
