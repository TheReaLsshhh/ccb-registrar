import { CSSProperties, ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Cropper, { Area } from 'react-easy-crop'

import {
  createRegistrarAccount,
  fetchMe,
  getErrorMessage,
  MeResponse,
  removeMyProfilePhoto,
  updateMe,
  uploadMyProfilePhoto,
} from '../api'
import { recordRecentMenu } from '../recentMenus'
import { AdminIcon } from '../components/Icons'

function EyeIcon({ off }: { off?: boolean }) {
  if (off) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 4l18 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M2 12s3.5-7 10-7c2.1 0 3.9.6 5.4 1.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M6.2 8.2C4 10.1 2.8 12 2.8 12s3.5 7 10 7c2.9 0 5.2-1.4 6.9-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M10.2 10.2a3.2 3.2 0 0 0 4.4 4.4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

const PROFILE_CROP_MAX_WIDTH = 420
const PROFILE_CROP_MAX_HEIGHT = 360
const PROFILE_EXPORT_MAX_DIMENSION = 1024
const PROFILE_MANUAL_CROP_SIZE = 320
const EDIT_PROFILE_NOTICE_DURATION_MS = 5000

type EditProfileNoticeTone = 'success' | 'error'

const resolveEditProfileNoticeMeta = (
  tone: EditProfileNoticeTone,
  message: string,
): { title: string; accentClassName: string; icon: string } => {
  const normalized = message.trim().toLowerCase()

  if (tone === 'error') {
    return { title: 'Error!', accentClassName: 'is-error', icon: 'x' }
  }

  if (normalized.includes('delete') || normalized.includes('removed')) {
    return { title: 'Deleted!', accentClassName: 'is-warning', icon: '!' }
  }

  if (normalized.includes('update') || normalized.includes('updated') || normalized.includes('save')) {
    return { title: 'Updated!', accentClassName: 'is-success', icon: 'check' }
  }

  return { title: 'Success!', accentClassName: 'is-success', icon: 'check' }
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function EditProfilePage() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPasswordHashed, setShowPasswordHashed] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [notificationProgress, setNotificationProgress] = useState(100)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [first_name, setFirstName] = useState('')
  const [last_name, setLastName] = useState('')
  const [password, setPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [is_active, setIsActive] = useState(true)
  const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false)
  const [createUsername, setCreateUsername] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createFirstName, setCreateFirstName] = useState('')
  const [createLastName, setCreateLastName] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createConfirmPassword, setCreateConfirmPassword] = useState('')
  const [createIsActive, setCreateIsActive] = useState(true)
  const [createAccountError, setCreateAccountError] = useState('')
  const [isCreatingAccount, setIsCreatingAccount] = useState(false)

  const [avatarError, setAvatarError] = useState('')
  const [isCropping, setIsCropping] = useState(false)
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null)
  const [selectedCropSourceFile, setSelectedCropSourceFile] = useState<File | null>(null)
  const [cropMode, setCropMode] = useState<'fit' | 'manual'>('fit')
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [cropAspect, setCropAspect] = useState(1)
  const [cropMinZoom, setCropMinZoom] = useState(1)
  const [cropFrameSize, setCropFrameSize] = useState({ width: 320, height: 320 })
  const [cropImageNaturalSize, setCropImageNaturalSize] = useState<{ width: number; height: number } | null>(null)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [isProfileUploading, setIsProfileUploading] = useState(false)
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null)
  const [pendingPhotoPreviewUrl, setPendingPhotoPreviewUrl] = useState<string | null>(null)
  const [pendingPhotoRemoval, setPendingPhotoRemoval] = useState(false)
  const profileImageInputRef = useRef<HTMLInputElement | null>(null)

  const onMediaLoaded = useCallback((mediaSize: { naturalWidth: number; naturalHeight: number }) => {
    const { naturalWidth, naturalHeight } = mediaSize
    if (!naturalWidth || !naturalHeight) return
    setCropImageNaturalSize({ width: naturalWidth, height: naturalHeight })
  }, [])

  const onCropComplete = useCallback((_a: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels)
  }, [])

  const getImageElement = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new Error('Unable to load image.'))
      image.src = src
    })

  const dataUrlToFile = async (dataUrl: string, filename: string, mimeType: string) => {
    const response = await fetch(dataUrl)
    const blob = await response.blob()
    return new File([blob], filename, { type: blob.type || mimeType })
  }

  const cropImageToDataUrl = async (
    imageSrc: string,
    cropArea: Area,
    mode: 'fit' | 'manual'
  ): Promise<{ dataUrl: string; mimeType: string; ext: string }> => {
    const image = await getImageElement(imageSrc)
    const exportWidth = Math.max(1, Math.round(cropArea.width))
    const exportHeight = Math.max(1, Math.round(cropArea.height))
    const downscaleRatio = Math.min(1, PROFILE_EXPORT_MAX_DIMENSION / Math.max(exportWidth, exportHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(exportWidth * downscaleRatio))
    canvas.height = Math.max(1, Math.round(exportHeight * downscaleRatio))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Unable to crop image.')
    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height
    const sx = cropArea.x * scaleX
    const sy = cropArea.y * scaleY
    const sWidth = cropArea.width * scaleX
    const sHeight = cropArea.height * scaleY
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'

    if (mode === 'manual') {
      ctx.beginPath()
      ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()
    }

    ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height)
    try {
      const webp = canvas.toDataURL('image/webp', 0.9)
      if (webp?.length) return { dataUrl: webp, mimeType: 'image/webp', ext: 'webp' }
    } catch {
      // ignore
    }
    return {
      dataUrl: canvas.toDataURL('image/jpeg', 0.9),
      mimeType: 'image/jpeg',
      ext: 'jpg',
    }
  }

  useEffect(() => {
    recordRecentMenu('/profile', 'Edit Profile')
  }, [])

  const activeNotification = useMemo(() => {
    if (error) return { tone: 'error' as const, message: error }
    if (success) return { tone: 'success' as const, message: success }
    return null
  }, [error, success])

  const clearActiveNotification = useCallback(() => {
    setError('')
    setSuccess('')
  }, [])

  const activeNotificationMeta = useMemo(
    () => (activeNotification ? resolveEditProfileNoticeMeta(activeNotification.tone, activeNotification.message) : null),
    [activeNotification],
  )

  useEffect(() => {
    if (!activeNotification) return
    setNotificationProgress(100)
    const startedAt = window.performance.now()
    const intervalId = window.setInterval(() => {
      const elapsed = window.performance.now() - startedAt
      const remaining = Math.max(0, EDIT_PROFILE_NOTICE_DURATION_MS - elapsed)
      setNotificationProgress((remaining / EDIT_PROFILE_NOTICE_DURATION_MS) * 100)
      if (remaining <= 0) {
        window.clearInterval(intervalId)
        clearActiveNotification()
      }
    }, 50)

    return () => {
      window.clearInterval(intervalId)
      setNotificationProgress(100)
    }
  }, [activeNotification, clearActiveNotification])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchMe()
      .then((data) => {
        if (cancelled) return
        setMe(data)
        setUsername(data.username)
        setEmail(data.email)
        setFirstName(data.first_name)
        setLastName(data.last_name)
        setIsActive(data.is_active)
      })
      .catch(() => {
        if (cancelled) return
        setMe(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      if (pendingPhotoPreviewUrl) URL.revokeObjectURL(pendingPhotoPreviewUrl)
    }
  }, [pendingPhotoPreviewUrl])

  useEffect(() => {
    if (!cropImageNaturalSize) return

    if (cropMode === 'manual') {
      setCropAspect(1)
      setCropFrameSize({ width: PROFILE_MANUAL_CROP_SIZE, height: PROFILE_MANUAL_CROP_SIZE })
      setCropMinZoom(1)
      setCrop({ x: 0, y: 0 })
      setZoom(1)
      return
    }

    const aspectRatio = cropImageNaturalSize.width / cropImageNaturalSize.height
    const fittedWidth = Math.min(PROFILE_CROP_MAX_WIDTH, PROFILE_CROP_MAX_HEIGHT * aspectRatio)
    const fittedHeight = Math.min(PROFILE_CROP_MAX_HEIGHT, PROFILE_CROP_MAX_WIDTH / aspectRatio)

    setCropAspect(aspectRatio)
    setCropFrameSize({
      width: Math.max(220, Math.round(fittedWidth)),
      height: Math.max(220, Math.round(fittedHeight)),
    })
    setCropMinZoom(1)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
  }, [cropImageNaturalSize, cropMode])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!me) return
    setSaveError('')
    setAvatarError('')
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      let photoUrl: string | null = me.photo_url
      if (pendingPhotoRemoval) {
        await removeMyProfilePhoto()
        photoUrl = null
      } else if (pendingPhotoFile) {
        const res = await uploadMyProfilePhoto(pendingPhotoFile)
        photoUrl = res?.photo_url ?? null
      }
      const payload: Parameters<typeof updateMe>[0] = {
        username: username.trim(),
        email: email.trim(),
        first_name: first_name.trim(),
        last_name: last_name.trim(),
      }
      if (password.trim()) payload.password = password
      if (me.is_superuser) payload.is_active = is_active
      const updated = await updateMe(payload)
      const finalPhotoUrl = pendingPhotoRemoval
        ? null
        : pendingPhotoFile && photoUrl
          ? `${photoUrl}${photoUrl.includes('?') ? '&' : '?'}v=${Date.now()}`
          : updated.photo_url
            ? `${updated.photo_url}${updated.photo_url.includes('?') ? '&' : '?'}v=${Date.now()}`
            : null
      const merged = { ...updated, photo_url: finalPhotoUrl }
      setMe(merged)
      setPassword('')
      setPendingPhotoFile(null)
      setPendingPhotoRemoval(false)
      if (pendingPhotoPreviewUrl) {
        URL.revokeObjectURL(pendingPhotoPreviewUrl)
        setPendingPhotoPreviewUrl(null)
      }
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: merged }))
      window.dispatchEvent(new CustomEvent('profile-photo-updated', { detail: { photo_url: merged.photo_url } }))

      const hadPhotoRemoval = pendingPhotoRemoval
      const hadPhotoUpload = !!pendingPhotoFile
      if (hadPhotoRemoval) {
        setSuccess('Profile photo removed successfully.')
      } else if (hadPhotoUpload) {
        setSuccess('Profile photo updated successfully.')
      } else {
        setSuccess('Profile updated successfully.')
      }
    } catch (err) {
      const msg = getErrorMessage(err)
      setSaveError(msg)
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleSelectProfileImage = () => {
    setAvatarError('')
    profileImageInputRef.current?.click()
  }

  const handleProfileImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      const msg = 'Please select a valid image file.'
      setAvatarError(msg)
      setError(msg)
      return
    }
    const previewUrl = URL.createObjectURL(file)
    setSelectedCropSourceFile(file)
    setCropImageSrc(previewUrl)
    setCropMode('fit')
    setZoom(1)
    setCrop({ x: 0, y: 0 })
    setCropAspect(1)
    setCropMinZoom(1)
    setCropFrameSize({ width: 320, height: 320 })
    setCropImageNaturalSize(null)
    setCroppedAreaPixels(null)
    setIsCropping(true)
    setAvatarError('')
  }

  const handleCancelCrop = () => {
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc)
    setCropImageSrc(null)
    setSelectedCropSourceFile(null)
    setIsCropping(false)
    setIsProfileUploading(false)
  }

  const handleConfirmCrop = async () => {
    if (!cropImageSrc) return
    setAvatarError('')
    setIsProfileUploading(true)
    try {
      let file: File
      if (cropMode === 'fit') {
        if (!selectedCropSourceFile) throw new Error('Please select an image to upload.')
        file = selectedCropSourceFile
      } else {
        if (!croppedAreaPixels) throw new Error('Please finish cropping the image.')
        const { dataUrl, mimeType, ext } = await cropImageToDataUrl(cropImageSrc, croppedAreaPixels, cropMode)
        file = await dataUrlToFile(dataUrl, `profile.${ext}`, mimeType)
      }
      const uploaded = await uploadMyProfilePhoto(file)
      const finalPhotoUrl = uploaded.photo_url
        ? `${uploaded.photo_url}${uploaded.photo_url.includes('?') ? '&' : '?'}v=${Date.now()}`
        : null
      setMe((current) => (current ? { ...current, photo_url: finalPhotoUrl } : current))
      if (pendingPhotoPreviewUrl) {
        URL.revokeObjectURL(pendingPhotoPreviewUrl)
        setPendingPhotoPreviewUrl(null)
      }
      setPendingPhotoFile(null)
      setPendingPhotoRemoval(false)
      window.dispatchEvent(new CustomEvent('profile-updated', { detail: { photo_url: finalPhotoUrl } }))
      window.dispatchEvent(new CustomEvent('profile-photo-updated', { detail: { photo_url: finalPhotoUrl } }))
      handleCancelCrop()
    } catch (err) {
      const msg = getErrorMessage(err) || 'Unable to prepare image. Please try again.'
      setAvatarError(msg)
      setError(msg)
    } finally {
      setIsProfileUploading(false)
    }
  }

  const handleRemovePhoto = () => {
    setAvatarError('')
    if (pendingPhotoFile) {
      setPendingPhotoFile(null)
      if (pendingPhotoPreviewUrl) {
        URL.revokeObjectURL(pendingPhotoPreviewUrl)
        setPendingPhotoPreviewUrl(null)
      }
    } else if (me?.photo_url) {
      setPendingPhotoRemoval(true)
    }
  }

  const resetCreateAccountForm = () => {
    setCreateUsername('')
    setCreateEmail('')
    setCreateFirstName('')
    setCreateLastName('')
    setCreatePassword('')
    setCreateConfirmPassword('')
    setCreateIsActive(true)
    setCreateAccountError('')
  }

  const handleOpenCreateAccount = () => {
    resetCreateAccountForm()
    setIsCreateAccountOpen(true)
  }

  const handleCloseCreateAccount = () => {
    if (isCreatingAccount) return
    setIsCreateAccountOpen(false)
    resetCreateAccountForm()
  }

  const handleCreateAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setCreateAccountError('')
    setError('')
    setSuccess('')

    if (!createUsername.trim()) {
      setCreateAccountError('Username is required.')
      return
    }
    if (!createPassword.trim()) {
      setCreateAccountError('Password is required.')
      return
    }
    if (createPassword.length < 8) {
      setCreateAccountError('Password must be at least 8 characters.')
      return
    }
    if (createPassword !== createConfirmPassword) {
      setCreateAccountError('Passwords do not match.')
      return
    }

    setIsCreatingAccount(true)
    try {
      const created = await createRegistrarAccount({
        username: createUsername.trim(),
        email: createEmail.trim(),
        first_name: createFirstName.trim(),
        last_name: createLastName.trim(),
        password: createPassword,
        is_active: createIsActive,
      })
      setSuccess(`Registrar account ${created.username} created successfully.`)
      setIsCreateAccountOpen(false)
      resetCreateAccountForm()
    } catch (err) {
      const msg = getErrorMessage(err)
      setCreateAccountError(msg)
      setError(msg)
    } finally {
      setIsCreatingAccount(false)
    }
  }

  if (loading) {
    return (
      <section className="card">
        <p>Loading profile…</p>
      </section>
    )
  }

  if (!me) {
    return (
      <section className="card">
        <p>Unable to load profile.</p>
      </section>
    )
  }

  const hasDisplayedProfileImage = !pendingPhotoRemoval && Boolean(pendingPhotoPreviewUrl || me.photo_url)

  return (
    <section className="card">
      <div className="edit-profile-page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
          <AdminIcon /> Edit Profile
        </h1>
        {(me.is_superuser || me.is_staff) && (
          <button type="button" className="confirm-btn" onClick={handleOpenCreateAccount}>
            Create Account
          </button>
        )}
      </div>
      <p>Manage your account information, profile photo, and sign‑in details.</p>

      {activeNotification && activeNotificationMeta && (
        <div className="enrollment-notice-overlay" role="presentation">
          <div
            className={`enrollment-notice-card ${activeNotificationMeta.accentClassName}`}
            role={activeNotification.tone === 'error' ? 'alertdialog' : 'dialog'}
            aria-live={activeNotification.tone === 'error' ? 'assertive' : 'polite'}
            aria-modal="true"
          >
            <div className="enrollment-notice-timer" aria-hidden="true">
              <div
                className={`enrollment-notice-icon ${activeNotificationMeta.accentClassName}`}
                style={{ '--notice-progress': `${notificationProgress}%` } as CSSProperties}
              >
                {activeNotificationMeta.icon === 'check' ? (
                  <svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">
                    <path d="M8 16.5 13.2 22 24 10.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">
                    {activeNotificationMeta.icon === 'x' ? (
                      <>
                        <path d="M10 10 22 22" />
                        <path d="M22 10 10 22" />
                      </>
                    ) : (
                      <>
                        <path d="M16 9v10" />
                        <circle cx="16" cy="24" r="1.5" fill="currentColor" stroke="none" />
                      </>
                    )}
                  </svg>
                )}
              </div>
            </div>
            <h2 className="enrollment-notice-title">{activeNotificationMeta.title}</h2>
            <p className="enrollment-notice-message">{activeNotification.message}</p>
            <button type="button" className="enrollment-notice-ok" onClick={clearActiveNotification}>
              Ok
            </button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="edit-profile-form">
        <section className="edit-profile-section edit-profile-avatar-section">
          <h2 className="section-title">Profile Photo</h2>
          <div className="edit-profile-avatar-row">
            <div className={`edit-profile-avatar-wrap${hasDisplayedProfileImage ? ' has-image' : ''}`}>
              {pendingPhotoRemoval ? (
                <span className="edit-profile-avatar-placeholder">
                  {me.username.charAt(0).toUpperCase()}
                </span>
              ) : pendingPhotoPreviewUrl ? (
                <img src={pendingPhotoPreviewUrl} alt="Profile preview" className="edit-profile-avatar-image" />
              ) : me.photo_url ? (
                <img src={me.photo_url} alt="Profile" className="edit-profile-avatar-image" />
              ) : (
                <span className="edit-profile-avatar-placeholder">
                  {me.username.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="edit-profile-avatar-actions">
              <button type="button" className="confirm-btn confirm-btn-secondary" onClick={handleSelectProfileImage}>
                Upload photo
              </button>
              {(me.photo_url || pendingPhotoFile) && !pendingPhotoRemoval && (
                <button type="button" className="confirm-btn confirm-btn-secondary" onClick={handleRemovePhoto}>
                  Remove photo
                </button>
              )}
            </div>
          </div>
          {avatarError && <p className="edit-profile-error">{avatarError}</p>}
          <input
            ref={profileImageInputRef}
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={handleProfileImageChange}
            aria-hidden
          />
        </section>

        <section className="edit-profile-section">
          <h2 className="section-title">Account Details</h2>
          <div className="edit-profile-grid">
            <div className="edit-profile-field">
              <label htmlFor="profile-id">ID</label>
              <input id="profile-id" type="text" value={me.id} readOnly disabled className="edit-profile-input readonly" />
            </div>
            <div className="edit-profile-field">
              <label htmlFor="profile-username">Username</label>
              <input
                id="profile-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="edit-profile-input"
                autoComplete="username"
              />
            </div>
            <div className="edit-profile-field">
              <label htmlFor="profile-email">Email</label>
              <input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="edit-profile-input"
                autoComplete="email"
              />
            </div>
            <div className="edit-profile-field">
              <label htmlFor="profile-first_name">First name</label>
              <input
                id="profile-first_name"
                type="text"
                value={first_name}
                onChange={(e) => setFirstName(e.target.value)}
                className="edit-profile-input"
                autoComplete="given-name"
              />
            </div>
            <div className="edit-profile-field">
              <label htmlFor="profile-last_name">Last name</label>
              <input
                id="profile-last_name"
                type="text"
                value={last_name}
                onChange={(e) => setLastName(e.target.value)}
                className="edit-profile-input"
                autoComplete="family-name"
              />
            </div>
            <div className="edit-profile-field">
              <label htmlFor="profile-password">New password</label>
              <div className="edit-profile-input-with-icon">
                <input
                  id="profile-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="edit-profile-input"
                  autoComplete="new-password"
                  placeholder="Leave blank to keep current"
                />
                <button
                  type="button"
                  className="edit-profile-icon-btn"
                  onClick={() => setShowNewPassword((v) => !v)}
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                >
                  <EyeIcon off={showNewPassword} />
                </button>
              </div>
            </div>
            <div className="edit-profile-field">
              <label>Password (hashed)</label>
              <div className="edit-profile-input-with-icon">
                <input
                  type={showPasswordHashed ? 'text' : 'password'}
                  value={me.password_hashed}
                  readOnly
                  disabled
                  className="edit-profile-input readonly"
                />
                <button
                  type="button"
                  className="edit-profile-icon-btn"
                  onClick={() => setShowPasswordHashed((v) => !v)}
                  aria-label={showPasswordHashed ? 'Hide hashed password' : 'Show hashed password'}
                >
                  <EyeIcon off={showPasswordHashed} />
                </button>
              </div>
            </div>
            <div className="edit-profile-field">
              <label>Last login</label>
              <input
                type="text"
                value={formatDateTime(me.last_login)}
                readOnly
                disabled
                className="edit-profile-input readonly"
              />
            </div>
            <div className="edit-profile-field">
              <label>Is superuser</label>
              <input
                type="text"
                value={me.is_superuser ? 'Yes' : 'No'}
                readOnly
                disabled
                className="edit-profile-input readonly"
              />
            </div>
            {me.is_superuser && (
              <div className="edit-profile-field">
                <label htmlFor="profile-active">Account Status</label>
                <select
                  id="profile-active"
                  value={is_active ? 'active' : 'inactive'}
                  onChange={(e) => setIsActive(e.target.value === 'active')}
                  className="edit-profile-input"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            )}
            <div className="edit-profile-field">
              <label>Date joined</label>
              <input
                type="text"
                value={formatDateTime(me.date_joined)}
                readOnly
                disabled
                className="edit-profile-input readonly"
              />
            </div>
          </div>
        </section>

        {saveError && <p className="edit-profile-error">{saveError}</p>}
        <div className="edit-profile-actions">
          <button type="submit" className="confirm-btn" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>

      {isCropping && cropImageSrc && (
        <div className="confirm-overlay" onClick={handleCancelCrop}>
          <div className="confirm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Edit profile photo</h3>
            <div className="profile-cropper-mode-switch" role="tablist" aria-label="Crop mode">
              <button
                type="button"
                className={`profile-cropper-mode-btn${cropMode === 'fit' ? ' is-active' : ''}`}
                onClick={() => setCropMode('fit')}
                aria-pressed={cropMode === 'fit'}
              >
                Fit Whole Image
              </button>
              <button
                type="button"
                className={`profile-cropper-mode-btn${cropMode === 'manual' ? ' is-active' : ''}`}
                onClick={() => setCropMode('manual')}
                aria-pressed={cropMode === 'manual'}
              >
                Manual Crop
              </button>
            </div>
            <div className="profile-cropper-frame" style={{ width: `${cropFrameSize.width}px`, height: `${cropFrameSize.height}px` }}>
              <Cropper
                image={cropImageSrc}
                crop={crop}
                zoom={zoom}
                aspect={cropAspect}
                cropShape={cropMode === 'manual' ? 'round' : 'rect'}
                showGrid={cropMode !== 'manual'}
                objectFit={cropMode === 'manual' ? 'cover' : 'contain'}
                minZoom={cropMinZoom}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
                onMediaLoaded={onMediaLoaded}
                cropSize={cropFrameSize}
              />
            </div>
            <div className="profile-cropper-controls">
              <label className="profile-cropper-zoom">
                {cropMode === 'manual' ? 'Zoom and drag to crop' : 'Zoom'}
                <input
                  type="range"
                  min={cropMinZoom}
                  max={3}
                  step={0.01}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  aria-label="Zoom"
                />
              </label>
            </div>
            <div className="confirm-actions">
              <button type="button" className="confirm-btn confirm-btn-secondary" onClick={handleCancelCrop} disabled={isProfileUploading}>
                Cancel
              </button>
              <button
                type="button"
                className="confirm-btn"
                onClick={handleConfirmCrop}
                disabled={isProfileUploading || (cropMode === 'manual' && !croppedAreaPixels)}
              >
                {isProfileUploading ? 'Uploading…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCreateAccountOpen && (
        <div className="confirm-overlay" onClick={handleCloseCreateAccount}>
          <div className="confirm-modal create-account-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Create Registrar Account</h3>
            <p className="create-account-copy">
              New accounts created here are administrator staff accounts for the registrar system.
            </p>
            <form className="edit-profile-form" onSubmit={handleCreateAccount}>
              <div className="edit-profile-grid">
                <div className="edit-profile-field">
                  <label htmlFor="create-account-username">Username</label>
                  <input
                    id="create-account-username"
                    type="text"
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                    className="edit-profile-input"
                    autoComplete="username"
                  />
                </div>
                <div className="edit-profile-field">
                  <label htmlFor="create-account-email">Email</label>
                  <input
                    id="create-account-email"
                    type="email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className="edit-profile-input"
                    autoComplete="email"
                  />
                </div>
                <div className="edit-profile-field">
                  <label htmlFor="create-account-first-name">First name</label>
                  <input
                    id="create-account-first-name"
                    type="text"
                    value={createFirstName}
                    onChange={(e) => setCreateFirstName(e.target.value)}
                    className="edit-profile-input"
                    autoComplete="given-name"
                  />
                </div>
                <div className="edit-profile-field">
                  <label htmlFor="create-account-last-name">Last name</label>
                  <input
                    id="create-account-last-name"
                    type="text"
                    value={createLastName}
                    onChange={(e) => setCreateLastName(e.target.value)}
                    className="edit-profile-input"
                    autoComplete="family-name"
                  />
                </div>
                <div className="edit-profile-field">
                  <label htmlFor="create-account-password">Password</label>
                  <input
                    id="create-account-password"
                    type="password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="edit-profile-input"
                    autoComplete="new-password"
                  />
                </div>
                <div className="edit-profile-field">
                  <label htmlFor="create-account-confirm-password">Confirm password</label>
                  <input
                    id="create-account-confirm-password"
                    type="password"
                    value={createConfirmPassword}
                    onChange={(e) => setCreateConfirmPassword(e.target.value)}
                    className="edit-profile-input"
                    autoComplete="new-password"
                  />
                </div>
                <div className="edit-profile-field">
                  <label htmlFor="create-account-status">Account Status</label>
                  <select
                    id="create-account-status"
                    value={createIsActive ? 'active' : 'inactive'}
                    onChange={(e) => setCreateIsActive(e.target.value === 'active')}
                    className="edit-profile-input"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div className="edit-profile-field">
                  <label>Access level</label>
                  <input type="text" value="Administrator" readOnly disabled className="edit-profile-input readonly" />
                </div>
              </div>
              {createAccountError && <p className="edit-profile-error">{createAccountError}</p>}
              <div className="confirm-actions">
                <button type="button" className="confirm-btn confirm-btn-secondary" onClick={handleCloseCreateAccount} disabled={isCreatingAccount}>
                  Cancel
                </button>
                <button type="submit" className="confirm-btn" disabled={isCreatingAccount}>
                  {isCreatingAccount ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  )
}
