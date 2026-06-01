class StarRating {
  constructor(value = 0) {
    this.value = value;
  }
  render() {
    return '★★★★★'
      .split('')
      .map((s, i) => (i < this.value ? '★' : '☆'))
      .join('');
  }
}
window.StarRating = StarRating;
