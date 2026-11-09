export const isValidPassword = (password: unknown): password is string =>
  typeof password === 'string'
  && password.length >= 4
  && password.length <= 15
  && !/[^A-Za-z0-9]/.test(password);

export const PASSWORD_POLICY_MESSAGE = 'يجب أن تتكون كلمة المرور من 4 إلى 15 خانة، أحرف إنجليزية وأرقام فقط';
