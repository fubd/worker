import { useState } from 'react';
import { Alert, Button, Form, Input, Modal } from 'antd';

import { useAuth } from '../auth/AuthProvider';

interface PasswordFormValues {
  password: string;
  confirmation: string;
}

export default function PasswordSettingsModal({
  hasPassword,
  onClose,
}: {
  hasPassword: boolean;
  onClose: () => void;
}) {
  const { setPassword } = useAuth();
  const [form] = Form.useForm<PasswordFormValues>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (!saving) onClose();
  };

  const submit = async (values: PasswordFormValues) => {
    setSaving(true);
    setError(null);
    try {
      await setPassword(values.password);
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '密码保存失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={hasPassword ? '修改登录密码' : '设置登录密码'}
      footer={null}
      maskClosable={!saving}
      onCancel={close}
    >
      <p className="swan-password-modal-copy">
        {hasPassword
          ? '修改后，邮箱和密码、Google、GitHub 仍会进入同一个雨燕账号。'
          : '设置后，邮箱和密码、Google、GitHub 会进入同一个雨燕账号。'}
      </p>
      {error && <Alert type="error" showIcon title={error} style={{ marginBottom: 16 }} />}
      <Form<PasswordFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={(values) => void submit(values)}
      >
        <Form.Item
          name="password"
          label="新密码"
          rules={[
            { required: true, message: '请输入新密码' },
            { min: 10, message: '密码至少需要 10 个字符' },
            { max: 128, message: '密码不能超过 128 个字符' },
          ]}
        >
          <Input.Password autoComplete="new-password" placeholder="至少 10 个字符" />
        </Form.Item>
        <Form.Item
          name="confirmation"
          label="确认新密码"
          dependencies={['password']}
          rules={[
            { required: true, message: '请再次输入新密码' },
            ({ getFieldValue }) => ({
              validator(_, value) {
                return !value || getFieldValue('password') === value
                  ? Promise.resolve()
                  : Promise.reject(new Error('两次输入的密码不一致'));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" placeholder="再次输入新密码" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={saving}>
          {hasPassword ? '更新密码' : '设置密码'}
        </Button>
      </Form>
    </Modal>
  );
}
