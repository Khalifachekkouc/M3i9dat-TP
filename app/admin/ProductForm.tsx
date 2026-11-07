"use client";

/* eslint-disable @next/next/no-img-element -- local object URLs and Storage URLs */
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  MAX_IMAGE_BYTES,
  createProduct,
  deleteImageQuietly,
  newProductId,
  parseImageUrl,
  parsePrice,
  storageEnabled,
  updateProduct,
  uploadProductImage,
  type ProductDraft,
} from "@/lib/admin-actions";
import { errorMessage } from "@/lib/data";
import { t } from "@/lib/i18n";
import type { Product } from "@/lib/types";
import styles from "./admin.module.css";

const tp = t.admin.products;

interface Props {
  product: Product | null;
  categories: string[];
  sauces: string[];
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}

type Errors = Partial<Record<"name" | "price" | "category" | "image" | "form", string>>;

export function ProductForm({ product, categories, sauces, nextOrder, onClose, onSaved }: Props) {
  const uid = useId();
  const [productId] = useState(() => product?.id ?? newProductId());
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(product ? String(product.price).replace(".", ",") : "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [available, setAvailableState] = useState(product?.available ?? true);
  // A new product offers every sauce by default; the admin unticks for drinks.
  const [sauceOptions, setSauceOptions] = useState<string[]>(product?.sauceOptions ?? sauces);
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  // Without Storage: the image is a pasted URL (Glovo's photos are links like this).
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const urlRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const categoryRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Free the preview's object URL when it is replaced or the form closes.
  useEffect(() => {
    if (!picked) return;
    return () => URL.revokeObjectURL(picked.url);
  }, [picked]);

  const file = picked?.file ?? null;

  // Sauces the product offers that are no longer in the shop list stay visible so they can be unticked.
  const sauceChoices = [...sauces, ...sauceOptions.filter((s) => !sauces.includes(s))];
  const typedUrl = parseImageUrl(imageUrl);
  const shownImage = storageEnabled
    ? (picked?.url ?? (removeImage ? null : product?.imageUrl || null))
    : typedUrl;

  function pickFile(f: File | undefined) {
    setErrors((e) => ({ ...e, image: undefined }));
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErrors((e) => ({ ...e, image: tp.imageWrongType }));
      return;
    }
    if (f.size > MAX_IMAGE_BYTES) {
      setErrors((e) => ({ ...e, image: tp.imageTooBig }));
      return;
    }
    setPicked({ file: f, url: URL.createObjectURL(f) });
    setRemoveImage(false);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const parsedPrice = parsePrice(price);
    const next: Errors = {};
    if (!name.trim()) next.name = tp.nameRequired;
    if (Number.isNaN(parsedPrice)) next.price = tp.priceInvalid;
    if (!category.trim()) next.category = tp.categoryRequired;
    if (!storageEnabled && imageUrl.trim() && !typedUrl) next.image = tp.imageUrlInvalid;
    setErrors(next);
    if (next.name) return nameRef.current?.focus();
    if (next.price) return priceRef.current?.focus();
    if (next.category) return categoryRef.current?.focus();
    if (next.image) return urlRef.current?.focus();

    const draft: ProductDraft = {
      name: name.trim(),
      price: parsedPrice,
      category: category.trim(),
      available,
      sauceOptions: sauceOptions.filter((s) => sauceChoices.includes(s)),
    };

    setSaving(true);
    if (!storageEnabled) {
      try {
        const image = typedUrl ? { imageUrl: typedUrl } : null;
        if (product) await updateProduct(product.id, draft, image ?? "remove");
        else await createProduct(productId, draft, image, nextOrder);
        onSaved();
      } catch (error) {
        setErrors({ form: errorMessage(error, tp.saveError, t.common.permissionDenied) });
      } finally {
        setSaving(false);
      }
      return;
    }

    let uploaded: { imageUrl: string; imagePath: string } | null = null;
    try {
      if (file) {
        setProgress(0);
        try {
          uploaded = await uploadProductImage(productId, file, setProgress);
        } catch (error) {
          setErrors({ image: errorMessage(error, tp.uploadError, t.common.permissionDenied) });
          fileRef.current?.focus();
          return;
        } finally {
          setProgress(null);
        }
      }

      if (product) {
        await updateProduct(product.id, draft, uploaded ?? (removeImage ? "remove" : "keep"));
        if (uploaded || removeImage) await deleteImageQuietly(product.imagePath);
      } else {
        await createProduct(productId, draft, uploaded, nextOrder);
      }
      onSaved();
    } catch (error) {
      if (uploaded) await deleteImageQuietly(uploaded.imagePath);
      setErrors({ form: errorMessage(error, tp.saveError, t.common.permissionDenied) });
    } finally {
      setSaving(false);
    }
  }

  const id = (k: string) => `${uid}-${k}`;

  return (
    <form className={styles.editor} onSubmit={onSubmit} noValidate>
      <div className={styles.editorHead}>
        <h2 className={styles.heading}>{product ? tp.editTitle : tp.createTitle}</h2>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {t.common.close}
        </button>
      </div>

      <div className="field">
        <label className="field-label" htmlFor={id("name")}>
          {tp.name}
        </label>
        <input
          ref={nameRef}
          id={id("name")}
          name="name"
          className="input"
          autoComplete="off"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={id("name-help")}
        />
        <p id={id("name-help")} className="field-help" data-error={errors.name ? "true" : undefined}>
          {errors.name ?? ""}
        </p>
      </div>

      <div className={styles.twoCols}>
        <div className="field">
          <label className="field-label" htmlFor={id("price")}>
            {tp.price}
          </label>
          <input
            ref={priceRef}
            id={id("price")}
            name="price"
            className="input num"
            inputMode="decimal"
            autoComplete="off"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-invalid={errors.price ? true : undefined}
            aria-describedby={id("price-help")}
          />
          <p id={id("price-help")} className="field-help" data-error={errors.price ? "true" : undefined}>
            {errors.price ?? ""}
          </p>
        </div>

        <div className="field">
          <label className="field-label" htmlFor={id("category")}>
            {tp.category}
          </label>
          <input
            ref={categoryRef}
            id={id("category")}
            name="category"
            className="input"
            list={id("categories")}
            autoComplete="off"
            maxLength={40}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-invalid={errors.category ? true : undefined}
            aria-describedby={id("category-help")}
          />
          <datalist id={id("categories")}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <p id={id("category-help")} className="field-help" data-error={errors.category ? "true" : undefined}>
            {errors.category ?? tp.categoryHelp}
          </p>
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor={id("image")}>
          {storageEnabled ? tp.image : tp.imageUrl}
        </label>
        <div className={styles.imageRow}>
          <span className={styles.imagePreview}>
            {shownImage ? (
              <img src={shownImage} alt="" width={96} height={96} />
            ) : (
              <span className={styles.imageNone}>{t.products.noImage}</span>
            )}
          </span>
          {!storageEnabled ? (
            <div className={styles.imageControls}>
              <input
                ref={urlRef}
                id={id("image")}
                name="imageUrl"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://"
                className="input"
                maxLength={2048}
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value);
                  setErrors((er) => ({ ...er, image: undefined }));
                }}
                aria-invalid={errors.image ? true : undefined}
                aria-describedby={id("image-help")}
              />
              {imageUrl && (
                <button type="button" className="btn btn-ghost" onClick={() => setImageUrl("")}>
                  {tp.removeImage}
                </button>
              )}
            </div>
          ) : (
          <div className={styles.imageControls}>
            <input
              ref={fileRef}
              id={id("image")}
              name="image"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className={styles.file}
              onChange={(e) => pickFile(e.target.files?.[0])}
              aria-invalid={errors.image ? true : undefined}
              aria-describedby={id("image-help")}
            />
            {shownImage && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setPicked(null);
                  setRemoveImage(true);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              >
                {tp.removeImage}
              </button>
            )}
          </div>
          )}
        </div>
        <p id={id("image-help")} className="field-help" data-error={errors.image ? "true" : undefined} aria-live="polite">
          {errors.image ??
            (!storageEnabled ? "" : progress !== null ? tp.uploading(progress) : tp.imageHelp)}
        </p>
      </div>

      <fieldset className={styles.fieldset}>
        <legend className="field-label">{tp.sauceOptions}</legend>
        <div className={styles.checkGrid}>
          {sauceChoices.map((s) => (
            <label key={s} className={styles.check}>
              <input
                type="checkbox"
                checked={sauceOptions.includes(s)}
                onChange={(e) =>
                  setSauceOptions((cur) => (e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)))
                }
              />
              <span>{s}</span>
            </label>
          ))}
        </div>
        <p className="field-help">{tp.sauceOptionsHelp}</p>
      </fieldset>

      <label className={styles.check}>
        <input type="checkbox" checked={available} onChange={(e) => setAvailableState(e.target.checked)} />
        <span>{tp.available}</span>
      </label>

      {errors.form && (
        <div className="banner" data-tone="error" role="alert">
          <span>{errors.form}</span>
        </div>
      )}

      <div className={styles.formActions}>
        <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
          {saving ? t.common.saving : t.common.save}
        </button>
        <button type="button" className="btn" onClick={onClose} disabled={saving}>
          {t.common.cancel}
        </button>
      </div>
    </form>
  );
}
