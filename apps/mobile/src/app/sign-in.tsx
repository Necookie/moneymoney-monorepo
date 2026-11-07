import { useSignIn } from '@clerk/expo';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Banner, Button, Field, Text } from '@/components/ui';

type Step = 'credentials' | 'second-factor';
type Factor = 'email_code' | 'totp' | 'phone_code';

interface ClerkLikeError {
  message?: string;
  longMessage?: string;
  errors?: { longMessage?: string; message?: string }[];
}

function messageOf(err: unknown): string {
  const e = err as ClerkLikeError | null;
  return (
    e?.errors?.[0]?.longMessage ??
    e?.errors?.[0]?.message ??
    e?.longMessage ??
    e?.message ??
    'Sign-in failed. Check your connection and try again.'
  );
}

/**
 * Private single-user app: sign-in only (no sign-up). Email + password with second-factor /
 * new-device verification (email code, authenticator app or SMS code) when Clerk requires it.
 */
export default function SignInScreen() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const [step, setStep] = useState<Step>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [factor, setFactor] = useState<Factor>('email_code');
  const [error, setError] = useState<string | null>(null);
  const busy = fetchStatus === 'fetching';

  const finish = async () => {
    const { error: finalizeError } = await signIn.finalize();
    if (finalizeError) setError(messageOf(finalizeError));
    // On success the root navigator's guard switches to the app automatically.
  };

  const startSecondFactor = async () => {
    const factors = signIn.supportedSecondFactors.map((f) => f.strategy);
    const chosen: Factor = factors.includes('totp')
      ? 'totp'
      : factors.includes('email_code')
        ? 'email_code'
        : factors.includes('phone_code')
          ? 'phone_code'
          : 'email_code';
    setFactor(chosen);
    if (chosen === 'email_code') {
      const { error: e } = await signIn.mfa.sendEmailCode();
      if (e) return setError(messageOf(e));
    } else if (chosen === 'phone_code') {
      const { error: e } = await signIn.mfa.sendPhoneCode();
      if (e) return setError(messageOf(e));
    }
    setStep('second-factor');
  };

  const submitCredentials = async () => {
    setError(null);
    const { error: e } = await signIn.password({ identifier: email.trim(), password });
    if (e) return setError(messageOf(e));
    if (signIn.status === 'complete') return finish();
    if (signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust') {
      return startSecondFactor();
    }
    setError('This sign-in needs a step the app does not support. Use the web app to finish it.');
  };

  const submitCode = async () => {
    setError(null);
    const verify =
      factor === 'totp'
        ? signIn.mfa.verifyTOTP({ code: code.trim() })
        : factor === 'phone_code'
          ? signIn.mfa.verifyPhoneCode({ code: code.trim() })
          : signIn.mfa.verifyEmailCode({ code: code.trim() });
    const { error: e } = await verify;
    if (e) return setError(messageOf(e));
    if (signIn.status === 'complete') return finish();
    setError('Verification incomplete. Try again.');
  };

  const startOver = async () => {
    await signIn.reset();
    setCode('');
    setError(null);
    setStep('credentials');
  };

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-between px-6 pb-8 pt-16"
          keyboardShouldPersistTaps="handled"
        >
          <View className="gap-3 rounded-card-lg bg-ink p-6">
            <Text weight="bold" className="text-display text-canvas" style={{ letterSpacing: -1 }}>
              money money
              <Text weight="bold" className="text-display text-accent">
                .
              </Text>
            </Text>
            <Text className="text-lg text-subtle">Know your money before you spend it.</Text>
          </View>

          <View className="gap-4 py-10">
            {step === 'credentials' ? (
              <>
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  error={errors.fields.identifier?.message ?? null}
                  returnKeyType="next"
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoComplete="password"
                  textContentType="password"
                  error={errors.fields.password?.message ?? null}
                  returnKeyType="go"
                  onSubmitEditing={submitCredentials}
                />
                <Button
                  label="Sign in"
                  variant="primary"
                  size="lg"
                  loading={busy}
                  disabled={!email.trim() || !password}
                  onPress={submitCredentials}
                />
              </>
            ) : (
              <>
                <Text className="text-muted">
                  {factor === 'totp'
                    ? 'Enter the 6-digit code from your authenticator app.'
                    : factor === 'phone_code'
                      ? 'We sent a code to your phone.'
                      : `We sent a verification code to ${email.trim()}.`}
                </Text>
                <Field
                  label="Code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={8}
                  error={errors.fields.code?.message ?? null}
                  onSubmitEditing={submitCode}
                />
                <Button
                  label="Verify"
                  variant="primary"
                  size="lg"
                  loading={busy}
                  disabled={code.trim().length < 4}
                  onPress={submitCode}
                />
                <Button label="Start over" variant="ghost" onPress={startOver} />
              </>
            )}
            {error ? <Banner tone="negative" icon="circle-alert" title={error} /> : null}
          </View>

          <Text className="text-center text-sm text-muted">
            Private instance · only the owner&apos;s account can sign in.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
