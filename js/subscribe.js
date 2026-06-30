/* Subscribe Bar & Modal Logic */

// Track where the subscribe content originally lives
var _subscribeOriginalParent = null;
var _subscribeOriginalNext = null;
function openSubscribeModal() {
  var content = document.getElementById('tab-subscribe');
  var modalBody = document.getElementById('subscribeModalBody');
  var overlay = document.getElementById('subscribeModalOverlay');
  if (!content || !modalBody || !overlay) return;
  // Remember original position
  _subscribeOriginalParent = content.parentNode;
  _subscribeOriginalNext = content.nextSibling;
  // Move into modal and make visible
  modalBody.appendChild(content);
  content.style.display = 'block';
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSubscribeModal() {
  var content = document.getElementById('tab-subscribe');
  var overlay = document.getElementById('subscribeModalOverlay');
  if (!content || !overlay) return;
  // Move content back to original location
  if (_subscribeOriginalParent) {
    if (_subscribeOriginalNext) {
      _subscribeOriginalParent.insertBefore(content, _subscribeOriginalNext);
    } else {
      _subscribeOriginalParent.appendChild(content);
    }
  }
  content.style.display = '';
  overlay.classList.remove('open');
  document.body.style.overflow = '';
}
