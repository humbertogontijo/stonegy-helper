/** Captured browse snapshot with 436 market pages (u16 header is sell chunk size). */
export const binaryMarketSnapshotBrowse436Pages =
  "U0cFJgEABwDrCwAAtAEAAAAAAAAAAAAAAAAAAAAAAAAHACQAODM1MWQ4ZWUtZjZkZi00MTkyLWI4ZDktMGZjZWRhMjAyZmQ3BQEAAAAAAAIDAAAAAAAABQAAAAoPAAAAAAAAUlndSZ8BAAAkAGYwNTJhZjNjLTFkYWUtNGUyOS1hN2FjLTU1MjYwYTdhZTg2MwIBAAAAAAAeIwAAAAAAACkAAADOnwUAAAAAAPyQ3EmfAQAAJABjNThiNWFiYy01OGU2LTRjMTktYmU5NC0yM2QyMzc3YjMxMDVmAwAAAAAAUwcAAAAAAABnAAAAZfICAAAAAABbI9xJnwEAACQAODk0ZDYxMDAtM2E4YS00NzRiLTlkNzctYmZiOTg3OWEzN2I3TwEAAAAAAGBtAAAAAAAAAgAAAMDaAAAAAAAAXxncSZ8BAAAkADFjZDY1YTM0LTdlYWYtNDZlMi04ODIxLWI4ZDQyMWUyNjA5My8FAAAAAAAPCQUAAAAAAAEAAAAPCQUAAAAAAEUV3EmfAQAAJAAyNWRjYTQ2MS02NzAxLTQwY2YtYjlmMS0xNWVhOGI4NmVmODG6AgAAAAAADBcAAAAAAAAFAAAAPHMAAAAAAADczdtJnwEAACQAZWE0MjdhMjctMzVlMS00YWYxLTkxMTktYThhM2Y5MGRjYzU5IQEAAAAAANUOAAAAAAAAAgAAAKodAAAAAAAAPn/bSZ8BAAAAAAcAAFJtUFmfAQAAAPykT1mfAQAAAFs3T1mfAQAAAF8tT1mfAQAAAEUpT1mfAQAAANzhTlmfAQAAAD6TTlmfAQAAAAA=";

export const expectedBinaryMarketSnapshotBrowse436Pages = {
  page: 1,
  totalPages: 7,
  requestedItemId: 3051,
  selectedItemTradableAmount: 436,
  resolvedTotalPages: 436,
  sellOrderCount: 7,
} as const;

/** Captured `market_get_snapshot` binary response (type 0x26). */
export const binaryMarketSnapshotBrowse =
  "U0cFJgEABwCjDAAAzwEAAAAAAAAAAAAAAAAAAAAAAAAHACQAZWQ5YmY2YWUtNWEzNi00NTVlLTg0OWYtY2EzYjRlYzA5YjMzDQAAAAAAAKwBAAAAAAAABQAAAFwIAAAAAAAAAAaiPp8BAAAkADcyYzBmOWRhLWEwNjQtNGJmNy1hNGZjLWFjODFmNmJhZGI4Yx8AAAAAAACgWgAAAAAAAAEAAACgWgAAAAAAAOmloT6fAQAAJABjZDIzNDE2OC1hNmVjLTRhZWQtODgwMS0xM2YzZWJiMmM0NjNCBQAAAAAATQAAAAAAAAABAAAATQAAAAAAAADDgaE+nwEAACQAZjlkYTZjODktOWE0My00MjQ5LThkMWUtMDQ5YjZhNDU3NTc0QwUAAAAAADoAAAAAAAAAAgAAAHQAAAAAAAAA9PigPp8BAAAkAGMzYTNmY2IyLTkzYjAtNDUwZi04YTc1LTRhYTZhOTdkZmJmMTQDAAAAAAC0AwAAAAAAAAEAAAC0AwAAAAAAAB3ioD6fAQAAJAA1ZDg2YmNhMC00ODIxLTQ3OGYtOWZkZS03YmY1ODQxODQ4OTY0AwAAAAAAtQMAAAAAAAABAAAAtQMAAAAAAAB1Z6A+nwEAACQAOGU1OWQ1M2YtZDc3Yy00NWE2LWI4ZjItZjlhYjk1MmMwMGQ1twAAAAAAAOIEAAAAAAAACQAAAPIrAAAAAAAApQ+gPp8BAAACACQAZmI0OTI1YTktMzBhNS00ZjRjLTlkYmYtZDI3NjFhOGRmOTVmRgIAAAABAM8HAAAAAAAAAQAAAM8HAAAAAAAACzt9PZ8BAAAkADg1ZmExMTdiLWEzZWMtNDQ4Ni1hYjRhLTIyOTljYzhiMjA0Zg0EAAAAAQAdAAAAAAAAAAEAAAAdAAAAAAAAAJPyDT2fAQAABwAAABoVTp8BAAAA6bkUTp8BAAAAw5UUTp8BAAAA9AwUTp8BAAAAHfYTTp8BAAAAdXsTTp8BAAAApSMTTp8BAAACAAALT/BMnwEAAACTBoFMnwEAAA==";

export const expectedBinaryMarketSnapshotBrowse = {
  page: 1,
  totalPages: 7,
  requestedItemId: 3235,
  selectedItemTradableAmount: 463,
  sellOrders: [
    {
      id: "ed9bf6ae-5a36-455e-849f-ca3b4ec09b33",
      itemId: 13,
      eachPrice: 428,
      itemAmount: 5,
      totalPrice: 2140,
    },
    {
      id: "72c0f9da-a064-4bf7-a4fc-ac81f6badb8c",
      itemId: 31,
      eachPrice: 23200,
      itemAmount: 1,
      totalPrice: 23200,
    },
    {
      id: "cd234168-a6ec-4aed-8801-13f3ebb2c463",
      itemId: 1346,
      eachPrice: 77,
      itemAmount: 1,
      totalPrice: 77,
    },
    {
      id: "f9da6c89-9a43-4249-8d1e-049b6a457574",
      itemId: 1347,
      eachPrice: 58,
      itemAmount: 2,
      totalPrice: 116,
    },
    {
      id: "c3a3fcb2-93b0-450f-8a75-4aa6a97dfbf1",
      itemId: 820,
      eachPrice: 948,
      itemAmount: 1,
      totalPrice: 948,
    },
    {
      id: "5d86bca0-4821-478f-9fde-7bf584184896",
      itemId: 820,
      eachPrice: 949,
      itemAmount: 1,
      totalPrice: 949,
    },
    {
      id: "8e59d53f-d77c-45a6-b8f2-f9ab952c00d5",
      itemId: 183,
      eachPrice: 1250,
      itemAmount: 9,
      totalPrice: 11250,
    },
  ],
  buyOrders: [
    {
      id: "fb4925a9-30a5-4f4c-9dbf-d2761a8df95f",
      itemId: 582,
      eachPrice: 1999,
      itemAmount: 1,
      totalPrice: 1999,
      isOwnOrder: true,
    },
    {
      id: "85fa117b-a3ec-4486-ab4a-2299cc8b204f",
      itemId: 1037,
      eachPrice: 29,
      itemAmount: 1,
      totalPrice: 29,
      isOwnOrder: true,
    },
  ],
} as const;
