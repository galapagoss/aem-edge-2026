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
    const content = row.firstElementChild;
    if (!content) return;

    // Check if this row contains an image
    const picture = content.querySelector('picture');
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
      // Check content type and wrap appropriately
      const text = content.textContent.trim();

      // Check if it's a button/link
      const link = content.querySelector('a');
      if (link && content.querySelectorAll('a').length === 1 && text === link.textContent.trim()) {
        const buttonWrapper = document.createElement('div');
        buttonWrapper.className = 'banner-button';
        link.classList.add('button');
        buttonWrapper.append(link);
        bannerContent.append(buttonWrapper);
      } else if (content.tagName === 'H1' || content.tagName === 'H2' || content.tagName === 'H3') {
        // It's a heading
        content.classList.add('banner-title');
        bannerContent.append(content);
      } else {
        // Regular body text
        content.classList.add('banner-body');
        bannerContent.append(content);
      }
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
