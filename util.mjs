const formatYMDHMS = function (date) {
    let option = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }
    return date.toLocaleString('ja-JP',option).replaceAll(/[-:/ ]/g, '');
}

export const repYmd = (text) => {
    return text.replace('<ymdhms>', formatYMDHMS(new Date()) );
};

export const randStr = () => Math.random().toString(32).substring(2);