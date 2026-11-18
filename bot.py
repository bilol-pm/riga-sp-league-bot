import asyncio
import logging
import os

from aiogram import Bot, Dispatcher
from aiogram.filters import Command
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    WebAppInfo,
)
from dotenv import load_dotenv

load_dotenv()
TOKEN = os.getenv("BOT_TOKEN")
WEBAPP_URL = os.getenv("WEBAPP_URL")  # https://... (Mini App manzili)

if not TOKEN:
    raise SystemExit("BOT_TOKEN topilmadi. .env faylini tekshiring.")
if not WEBAPP_URL:
    raise SystemExit("WEBAPP_URL topilmadi. .env faylini tekshiring.")

logging.basicConfig(level=logging.INFO)
print(f"WEBAPP_URL = {WEBAPP_URL}")

bot = Bot(token=TOKEN)
dp = Dispatcher()


@dp.message(Command("start"))
async def cmd_start(message: Message):
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="⚽ O'yinlarni ochish",
                    web_app=WebAppInfo(url=WEBAPP_URL),
                )
            ]
        ]
    )
    await message.answer(
        "Salom! ⚽ Futbol o'yiniga ro'yxatdan o'tish uchun tugmani bosing.",
        reply_markup=kb,
    )


async def main():
    # Chap pastdagi menyu tugmasi ham Mini App'ni ochadi
    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(
            text="⚽ O'yinlar", web_app=WebAppInfo(url=WEBAPP_URL)
        )
    )
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
