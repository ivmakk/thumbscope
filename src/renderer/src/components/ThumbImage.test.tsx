import { test, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThumbImage } from './ThumbImage'
import { thumbUrl } from '@/lib/imageCache'

test('renders an <img> whose src is the sync thumbUrl', () => {
  render(<ThumbImage streamName="21" version={3} alt="pic" />)
  expect(screen.getByAltText('pic')).toHaveAttribute('src', thumbUrl('21', 3))
})

test('shows skeleton until the <img> loads', () => {
  const { container } = render(<ThumbImage streamName="21" version={3} alt="pic" />)
  expect(container.querySelector('.animate-pulse')).not.toBeNull()
  fireEvent.load(screen.getByAltText('pic'))
  expect(container.querySelector('.animate-pulse')).toBeNull()
})

test('error drops the skeleton (no perpetual pulse)', () => {
  const { container } = render(<ThumbImage streamName="21" version={3} alt="pic" />)
  fireEvent.error(screen.getByAltText('pic'))
  expect(container.querySelector('.animate-pulse')).toBeNull()
})

test('a version change yields a new src (cache-bust)', () => {
  const { rerender } = render(<ThumbImage streamName="21" version={3} alt="pic" />)
  expect(screen.getByAltText('pic')).toHaveAttribute('src', thumbUrl('21', 3))
  rerender(<ThumbImage streamName="21" version={4} alt="pic" />)
  expect(screen.getByAltText('pic')).toHaveAttribute('src', thumbUrl('21', 4))
})
