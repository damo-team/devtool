import MockJS from 'mockjs';
import antd from 'antd';
var MockRandom = MockJS.Random;

export default formatters = {
    date(){
        return MockRandom.date();
    },
    dataTime(){
        return MockRandom.datetime('yyyy-MM-ddTHH:mm:ss');
    },
    float(){
        return MockRandom.float(0, 99999);
    },
    phone(){
        const arr = [1];
        for(let i = 10; i--;){
          arr.push(Random.integer(0, 9));
        }
        return Number(arr.join(''));
    },
    telephone(){
        const arr = [1];
        for(let i = 3; i--;){
          arr.push(Random.integer(0, 9));
        }
        arr.push('-');
        for(let i = 7; i--;){
          arr.push(Random.integer(0, 9));
        }
        return arr.join('');
    },
    hex(){
        return Random.hex()
    },
    func(){
      return () => {

      }
    },
    antd(){
      const keys = Object.keys(antd);
      return antd[keys[Math.floor(Math.random(10) * keys.length)]];
    }
}
