/** Captured browse snapshot with 436 market pages (u16 header is sell chunk size). */
export const binaryMarketSnapshotBrowse436Pages =
  "U0cFJgEABwDrCwAAtAEAAAAAAAAAAAAAAAAAAAAAAAAHACQAY2NjY2NjY2MtY2NjYy00Y2NjLThjY2MtMDAwMDAwMDAwMDBiBQEAAAAAAAIDAAAAAAAABQAAAAoPAAAAAAAAUlndSZ8BAAAkADExMTExMTExLTExMTEtNDExMS04MTExLTAwMDAwMDAwMDAwYgIBAAAAAAAeIwAAAAAAACkAAADOnwUAAAAAAPyQ3EmfAQAAJABlZWVlZWVlZS1lZWVlLTRlZWUtOGVlZS0wMDAwMDAwMDAwMGJmAwAAAAAAUwcAAAAAAABnAAAAZfICAAAAAABbI9xJnwEAACQAZGRkZGRkZGQtZGRkZC00ZGRkLThkZGQtMDAwMDAwMDAwMDBiTwEAAAAAAGBtAAAAAAAAAgAAAMDaAAAAAAAAXxncSZ8BAAAkAGFhYWFhYWFhLWFhYWEtNGFhYS04YWFhLTAwMDAwMDAwMDAwYi8FAAAAAAAPCQUAAAAAAAEAAAAPCQUAAAAAAEUV3EmfAQAAJABiYmJiYmJiYi1iYmJiLTRiYmItOGJiYi0wMDAwMDAwMDAwMGK6AgAAAAAADBcAAAAAAAAFAAAAPHMAAAAAAADczdtJnwEAACQAZmZmZmZmZmYtZmZmZi00ZmZmLThmZmYtMDAwMDAwMDAwMDBiIQEAAAAAANUOAAAAAAAAAgAAAKodAAAAAAAAPn/bSZ8BAAAAAAcAAFJtUFmfAQAAAPykT1mfAQAAAFs3T1mfAQAAAF8tT1mfAQAAAEUpT1mfAQAAANzhTlmfAQAAAD6TTlmfAQAAAAA=";

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
  "U0cFJgEABwCjDAAAzwEAAAAAAAAAAAAAAAAAAAAAAAAHACQAYWFhYWFhYWEtYWFhYS00YWFhLThhYWEtMDAwMDAwMDAwMDBjDQAAAAAAAKwBAAAAAAAABQAAAFwIAAAAAAAAAAaiPp8BAAAkAGZmZmZmZmZmLWZmZmYtNGZmZi04ZmZmLTAwMDAwMDAwMDAwYR8AAAAAAACgWgAAAAAAAAEAAACgWgAAAAAAAOmloT6fAQAAJAAyMjIyMjIyMi0yMjIyLTQyMjItODIyMi0wMDAwMDAwMDAwMGJCBQAAAAAATQAAAAAAAAABAAAATQAAAAAAAADDgaE+nwEAACQAY2NjY2NjY2MtY2NjYy00Y2NjLThjY2MtMDAwMDAwMDAwMDBjQwUAAAAAADoAAAAAAAAAAgAAAHQAAAAAAAAA9PigPp8BAAAkAGZmZmZmZmZmLWZmZmYtNGZmZi04ZmZmLTAwMDAwMDAwMDAwYjQDAAAAAAC0AwAAAAAAAAEAAAC0AwAAAAAAAB3ioD6fAQAAJABjY2NjY2NjYy1jY2NjLTRjY2MtOGNjYy0wMDAwMDAwMDAwMGE0AwAAAAAAtQMAAAAAAAABAAAAtQMAAAAAAAB1Z6A+nwEAACQANzc3Nzc3NzctNzc3Ny00Nzc3LTg3NzctMDAwMDAwMDAwMDBhtwAAAAAAAOIEAAAAAAAACQAAAPIrAAAAAAAApQ+gPp8BAAACACQAZGRkZGRkZGQtZGRkZC00ZGRkLThkZGQtMDAwMDAwMDAwMDBjRgIAAAABAM8HAAAAAAAAAQAAAM8HAAAAAAAACzt9PZ8BAAAkADU1NTU1NTU1LTU1NTUtNDU1NS04NTU1LTAwMDAwMDAwMDAwYQ0EAAAAAQAdAAAAAAAAAAEAAAAdAAAAAAAAAJPyDT2fAQAABwAAABoVTp8BAAAA6bkUTp8BAAAAw5UUTp8BAAAA9AwUTp8BAAAAHfYTTp8BAAAAdXsTTp8BAAAApSMTTp8BAAACAAALT/BMnwEAAACTBoFMnwEAAA==";

export const expectedBinaryMarketSnapshotBrowse = {
  page: 1,
  totalPages: 7,
  requestedItemId: 3235,
  selectedItemTradableAmount: 463,
  sellOrders: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-00000000000c",
      itemId: 13,
      eachPrice: 428,
      itemAmount: 5,
      totalPrice: 2140,
    },
    {
      id: "ffffffff-ffff-4fff-8fff-00000000000a",
      itemId: 31,
      eachPrice: 23200,
      itemAmount: 1,
      totalPrice: 23200,
    },
    {
      id: "22222222-2222-4222-8222-00000000000b",
      itemId: 1346,
      eachPrice: 77,
      itemAmount: 1,
      totalPrice: 77,
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-00000000000c",
      itemId: 1347,
      eachPrice: 58,
      itemAmount: 2,
      totalPrice: 116,
    },
    {
      id: "ffffffff-ffff-4fff-8fff-00000000000b",
      itemId: 820,
      eachPrice: 948,
      itemAmount: 1,
      totalPrice: 948,
    },
    {
      id: "cccccccc-cccc-4ccc-8ccc-00000000000a",
      itemId: 820,
      eachPrice: 949,
      itemAmount: 1,
      totalPrice: 949,
    },
    {
      id: "77777777-7777-4777-8777-00000000000a",
      itemId: 183,
      eachPrice: 1250,
      itemAmount: 9,
      totalPrice: 11250,
    },
  ],
  buyOrders: [
    {
      id: "dddddddd-dddd-4ddd-8ddd-00000000000c",
      itemId: 582,
      eachPrice: 1999,
      itemAmount: 1,
      totalPrice: 1999,
      isOwnOrder: true,
    },
    {
      id: "55555555-5555-4555-8555-00000000000a",
      itemId: 1037,
      eachPrice: 29,
      itemAmount: 1,
      totalPrice: 29,
      isOwnOrder: true,
    },
  ],
} as const;
