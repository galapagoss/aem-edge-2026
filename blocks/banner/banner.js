import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * loads and decorates the banner block
 * @param {Element} block The block element
 */
export default async function decorate(block) {
  // Extract content from the block
  const rows = [...block.children];

  // Create banner structure
  const bannerContent = document.createElement('div');
  bannerContent.className = 'banner-content';

  let imageWrapper = null;
  let hasImage = false;

  // Process each row
  rows.forEach((row) => {
    const cell = row.firstElementChild;
    if (!cell) return;

    const text = cell.textContent.trim();

    // Check for style variant (small, large, hero, etc.)
    const styleVariants = ['small', 'large', 'hero', 'left-aligned', 'right-aligned', 'no-overlay', 'rounded-none', 'rounded-sm', 'rounded-full'];
    if (styleVariants.includes(text)) {
      block.classList.add(text);
      return;
    }

    // Check if this row contains an image
    const picture = cell.querySelector('picture');
    if (picture) {
      hasImage = true;
      imageWrapper = document.createElement('div');
      imageWrapper.className = 'banner-image';

      // Optimize the image
      const img = picture.querySelector('img');
      if (img) {
        const optimizedPic = createOptimizedPicture(img.src, img.alt, false, [{ width: '2000' }]);
        imageWrapper.append(optimizedPic);
      } else {
        imageWrapper.append(picture);
      }
    } else {
      // This is the body content (richtext with title, text, button)
      // Process all children and add appropriate classes
      [...cell.children].forEach((child) => {
        const tagName = child.tagName.toLowerCase();

        if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
          child.classList.add('banner-title');
          bannerContent.append(child);
        } else if (tagName === 'p') {
          // Check if paragraph contains only a link (button)
          const link = child.querySelector('a');
          if (link && child.querySelectorAll('a').length === 1 && child.textContent.trim() === link.textContent.trim()) {
            const buttonWrapper = document.createElement('div');
            buttonWrapper.className = 'banner-button';
            link.classList.add('button');
            buttonWrapper.append(link);
            bannerContent.append(buttonWrapper);
          } else {
            child.classList.add('banner-body');
            bannerContent.append(child);
          }
        } else if (tagName === 'a') {
          // Standalone link
          const buttonWrapper = document.createElement('div');
          buttonWrapper.className = 'banner-button';
          child.classList.add('button');
          buttonWrapper.append(child);
          bannerContent.append(buttonWrapper);
        } else {
          // Any other element
          bannerContent.append(child);
        }
      });
    }
  });

  // Clear the block and rebuild
  block.textContent = '';

  // Add image if present
  if (imageWrapper) {
    block.append(imageWrapper);
  }

  // Add content wrapper
  block.append(bannerContent);

  // Add variant class if image exists
  if (hasImage) {
    block.classList.add('has-image');
  }
}
